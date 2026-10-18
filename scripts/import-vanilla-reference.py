"""Regenerate numeric 1.2 data from the pinned, licensed reference files.

Usage: python scripts/import-vanilla-reference.py REFERENCE_DIRECTORY GEOMETRY_JSON
Download the files listed in docs/data/vanilla-source-manifest.json separately.
Source content is parsed as CSV/JSON and never executed.
"""

import csv
import hashlib
import json
import sys
from collections import defaultdict
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "docs/data/vanilla-source-manifest.json"


def generate(reference_directory, geometry_path):
    manifest = json.loads(MANIFEST.read_text())
    supplemental_bytes = geometry_path.with_name("game_data.json").read_bytes()
    if hashlib.sha256(supplemental_bytes).hexdigest() != manifest["supplementalItems"]["sha256"]:
        raise ValueError("Source hash mismatch: supplemental item names/forms")
    supplemental_items = json.loads(supplemental_bytes)["items"]
    tables = {}
    for name, expected in manifest["referenceFiles"].items():
        path = reference_directory / name
        content = path.read_bytes()
        if hashlib.sha256(content).hexdigest() != expected:
            raise ValueError(f"Source hash mismatch: {name}")
        with path.open(encoding="utf-8-sig", newline="") as file:
            tables[name] = list(csv.DictReader(file))

    build = tables["game_builds.csv"][0]
    if build["game_version"] != "1.2.4.0" or build["build_number"] != "502094":
        raise ValueError("The reference does not identify the expected 1.2 build")
    for name, rows in tables.items():
        if name != "game_builds.csv":
            if any(row["game_build_id"] != build["game_build_id"] for row in rows):
                raise ValueError(f"Mixed game builds: {name}")

    schematics = {row["schematic_id"]: row for row in tables["schematics.csv"]}
    unlocks = defaultdict(set)
    for row in tables["schematic_recipe_unlocks.csv"]:
        unlocks[row["recipe_id"]].add(row["schematic_id"])

    def tier(recipe_id):
        return min(
            (
                int(schematics[key]["tech_tier"])
                for key in unlocks[recipe_id]
                if schematics[key]["schematic_type"] in ("EST_Milestone", "EST_Tutorial")
                or key == "Schematic_StartingRecipes_C"
            ),
            default=None,
        )

    # Preserve the existing non-seasonal workflow. Event-only unlocks are explicit exclusions.
    included = []
    excluded = []
    for row in tables["recipes.csv"]:
        keys = unlocks[row["recipe_id"]]
        seasonal = bool(keys) and all("XMas" in key or "Ficsmas" in key for key in keys)
        (excluded if seasonal else included).append(row)

    producers = {row["recipe_id"]: row for row in tables["recipe_producers.csv"]}
    lines = defaultdict(list)
    for row in tables["recipe_io.csv"]:
        lines[row["recipe_id"]].append(row)
    produced = {row["item_id"] for row in tables["recipe_io.csv"] if row["direction"] == "output"}
    items = {}
    for row in tables["items.csv"]:
        native = row["descriptor_native_class"]
        items[row["item_id"]] = {
            "id": row["item_id"],
            "name": row["display_name"],
            "raw": native == "FGResourceDescriptor" or (
                native == "FGItemDescriptorBiomass" and row["item_id"] not in produced
            ),
            "transport": "pipe" if row["form"] in ("liquid", "gas") else "belt",
        }
    # The IO table also identifies ammo/equipment descriptors omitted by items.csv.
    for row in tables["recipe_io.csv"]:
        if row["item_id"] not in items:
            supplemental = supplemental_items.get(row["item_id"])
            if row["unit"] != "items" or not supplemental or supplemental["form"] != "RF_SOLID":
                raise ValueError(f"Unresolved item descriptor: {row['item_id']}")
            items[row["item_id"]] = {
                "id": row["item_id"], "name": supplemental["name"],
                "raw": False, "transport": "belt",
            }

    recipes = []
    recipe_unlocks = {}
    for row in sorted(included, key=lambda row: row["recipe_id"]):
        recipe_id = row["recipe_id"]
        if row["producer_count"] != "1":
            raise ValueError(f"Unsupported producer count: {recipe_id}")
        recipes.append({
            "id": recipe_id,
            "name": row["display_name"],
            "machineId": producers[recipe_id]["producer_class"].replace("Build_", "Desc_", 1),
            "durationSeconds": str(Fraction(row["manufacturing_duration_sec"])),
            **{
                field: [
                    {"itemId": part["item_id"], "quantity": str(Fraction(part["amount_per_cycle"]))}
                    for part in sorted(lines[recipe_id], key=lambda part: part["item_id"])
                    if part["direction"] == direction
                ]
                for field, direction in (("inputs", "input"), ("outputs", "output"))
            },
        })
        recipe_unlocks[recipe_id] = {
            "alternate": row["is_alternate"] == "true",
            "tier": tier(recipe_id), "unlockIds": sorted(unlocks[recipe_id]),
        }

    machines = [
        {"id": row["producer_class"].replace("Build_", "Desc_", 1), "name": row["display_name"]}
        for row in tables["production_buildings.csv"]
    ]
    building_recipes = {row["building_class"]: row["recipe_id"] for row in tables["building_recipes.csv"]}
    machine_unlocks = {machine["id"]: tier(building_recipes[machine["id"]]) for machine in machines}
    transport_unlocks = {
        "belt": [tier(f"Recipe_ConveyorBeltMk{mark}_C") for mark in range(1, 7)],
        "pipe": [tier("Recipe_Pipeline_C"), tier("Recipe_PipelineMK2_C")],
    }
    provenance_hash = hashlib.sha256(
        json.dumps(manifest["referenceFiles"], sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    catalog = {
        "schemaVersion": 1, "catalogVersion": manifest["catalogVersion"],
        "provenance": {
            "kind": "unverified-game",
            "source": "Pinned Satisfactory 1.2.4.0 numeric tables by Greg McDowell; artwork and descriptions omitted",
            "gameBuild": build["build_number"],
            "manifest": {
                "gameVersion": build["game_version"], "build": build["build_number"],
                "sourceUrl": manifest["referenceUrl"],
                "license": "MIT; Copyright (c) 2026 Greg McDowell and Aadit Sachdev; see docs/data/*-LICENSE.txt",
                "contentSha256": provenance_hash,
            },
        },
        "items": sorted(items.values(), key=lambda item: item["id"]),
        "machines": sorted(machines, key=lambda machine: machine["id"]),
        "recipes": recipes,
    }
    dump = lambda value: json.dumps(value, ensure_ascii=False, indent=2)
    snapshot = (
        "// Generated numeric 1.2 snapshot. Source, hashes and license: docs/data/vanilla.md\n"
        "import type { Catalog } from '../domain/catalog.js';\n"
        f"export const vanillaSnapshot: Catalog = {dump(catalog)};\n"
        "export const recipeUnlocks: Record<string, {alternate: boolean; tier: number | null; unlockIds: string[]}> = "
        f"{dump(recipe_unlocks)};\n"
        f"export const machineUnlocks: Record<string, number | null> = {dump(machine_unlocks)};\n"
        f"export const transportUnlocks = {dump(transport_unlocks)} as const;\n"
    )

    geometry_bytes = geometry_path.read_bytes()
    if hashlib.sha256(geometry_bytes).hexdigest() != manifest["geometry"]["sha256"]:
        raise ValueError("Source hash mismatch: machine geometry")
    geometry_source = json.loads(geometry_bytes)
    geometry = {}
    for machine in machines:
        source_class = machine["id"].replace("Desc_", "Build_", 1)
        if source_class not in geometry_source["buildings"]:
            continue
        record = geometry_source["buildings"][source_class]
        clearance_size = [
            float(Fraction(str(hi)) - Fraction(str(lo)))
            for lo, hi in zip(record["clearance_min"], record["clearance_max"])
        ]
        geometry[machine["id"]] = {
            "sourceClass": source_class,
            "bounds": {"min": record["bounds_min"], "max": record["bounds_max"],
                       "size": dict(zip(("width", "depth", "height"), record["size"]))},
            "clearance": {"min": record["clearance_min"], "max": record["clearance_max"],
                          "size": dict(zip(("width", "depth", "height"), clearance_size))},
            "ports": [{"id": port["name"], "direction": port["dir"],
                       "position": port["pos"], "facing": port["facing"]} for port in record["ports"]],
        }
    geometry_snapshot = {
        "schemaVersion": 1, "catalogVersion": manifest["catalogVersion"], "units": "m",
        "provenance": {
            "author": "Aadit Sachdev", "license": "MIT", "gameVersion": "1.2", "gameBuild": None,
            "sourceUrl": manifest["geometry"]["sourceUrl"], "sourceSha256": manifest["geometry"]["sha256"],
        },
        "machines": geometry,
    }
    (ROOT / "src/data/vanilla-snapshot.ts").write_text(snapshot)
    (ROOT / "src/data/machine-geometry.ts").write_text(
        "// Numeric measurements, Copyright (c) 2026 Aadit Sachdev (MIT).\n"
        "// License: docs/data/SatisfactoryAI-LICENSE.txt; provenance: docs/data/geometry-sources.md\n"
        f"export const machineGeometrySnapshot = {dump(geometry_snapshot)} as const;\n"
    )
    print(json.dumps({"items": len(items), "recipes": len(recipes), "machines": len(machines),
                      "seasonalRecipesExcluded": len(excluded), "machineGeometry": len(geometry)}))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    generate(Path(sys.argv[1]), Path(sys.argv[2]))
