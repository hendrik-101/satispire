import { Rational } from '../../src/domain/rational.js';
import {
  defaultBuildVariant,
  deriveBuildVariants,
  type BuildVariant,
} from '../../src/domain/build-variants.js';
import { planFileSchema } from '../../src/plan-file.js';
import type {
  SessionPlan,
  SessionSnapshot,
  SessionPresence,
} from '../../src/session-plan.js';
import {
  createSessionController,
  type SessionController,
  type SessionStatus,
} from './session';
import {
  createUnlockProfile,
  validateUnlockProfile,
  MAX_HUB_TIER_BY_PHASE,
  type UnlockProfile,
} from '../../src/domain/session-unlocks.js';
import { loadUnlockProfile, saveUnlockProfile } from './unlock-storage';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  canonical,
  diffPlan,
  type SharedPlan,
} from '../../src/domain/shared-plan';
import type { RoomPlan } from '../../src/room-api';
import {
  solveProduction,
  INPUT_ENTRY_LIMIT,
  type ProductionInput,
} from '../../src/domain/production.js';
import {
  defaultViewPreferences,
  effectivePresentation,
  restorePreferences,
  updateViewPreferences,
  type ViewPreset,
} from '../../src/domain/view-preferences.js';
import {
  vanillaCatalog,
  technologyAtTier,
  availableChoices,
  availableRecipes,
  recipeUnlocks,
} from '../../src/domain/vanilla.js';
import { generateSupplyLayout } from '../../src/domain/supply-layout.js';
import { type TechnologyProfile } from '../../src/domain/technology.js';
import { localizedName as itemName } from './labels.js';
import { FloorView } from './FloorView';
import { Graph } from './Graph';
import { Icon } from './Icon';
import { ProductionView } from './ProductionView';
import { MachineGlyph } from './MachineGlyph';
import { SourceCredits } from './SourceCredits';
import { calculateProduction } from './model';
import {
  sizeProductionByInput,
  productionSizingInputs,
} from '../../src/domain/production-sizing.js';
import { formatPercent, formatRate, formatRateInput } from './format-rate.js';
import { createLocalApplication } from '../../src/application.js';
import { createRoom } from '../../src/domain/rooms.js';
import {
  registerWebMcp,
  type ModelContext,
} from '../../src/adapters/webmcp.js';

const catalog = vanillaCatalog;
const firstTechnology = technologyAtTier(2);
const firstInput: ProductionInput = {
  targets: [{ itemId: 'Desc_IronPlate_C', rate: '20' }],
  recipes: availableChoices(firstTechnology),
  imports: catalog.items.filter((i) => i.raw).map((i) => i.id),
  technology: firstTechnology,
};
function firstStage(plan: ReturnType<typeof solveProduction>) {
  return deriveBuildVariants(plan).floors[0]!.itemId;
}
function primaryStage(
  input: ProductionInput,
  plan: ReturnType<typeof solveProduction>,
) {
  return (
    input.targets.find((t) => plan.nodes.some((n) => n.itemId === t.itemId))
      ?.itemId ?? plan.nodes[0]!.itemId
  );
}
function feasibleRecipes(technology: TechnologyProfile, imports: string[]) {
  const defaults = availableChoices(technology, imports);
  return availableRecipes(technology).filter((recipe) => {
    try {
      solveProduction(catalog, {
        targets: [{ itemId: recipe.outputs[0]!.itemId, rate: '1' }],
        recipes: { ...defaults, [recipe.outputs[0]!.itemId]: recipe.id },
        imports: imports,
        technology: technology,
      });
      return true;
    } catch {
      return false;
    }
  });
}
const initialView = {
  ...defaultViewPreferences,
  panels: { navigation: false, graph: false, inspector: false },
};
const KEY = 'satispire.personal-view.v2';
const roomContext = { roomId: 'local', participantId: 'workspace-owner' };
// Access is deferred so browsers which block even the storage getter remain usable.
const sessionUnlockStorage = {
  getItem: (key: string) => window.sessionStorage.getItem(key),
  setItem: (key: string, value: string) =>
    window.sessionStorage.setItem(key, value),
};
const browserUnlockStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) =>
    window.localStorage.setItem(key, value),
};
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Plan konnte nicht verarbeitet werden.';
export interface SharedWorkspace {
  plan: SharedPlan;
  revision: number;
  busy: boolean;
  onEdit: (plan: SharedPlan, expectedRevision: number) => Promise<RoomPlan>;
  controls: ReactNode;
}
export function Workspace({
  shared,
  localOnly = false,
}: { shared?: SharedWorkspace; localOnly?: boolean } = {}) {
  const [sessionProfile, setSessionProfile] = useState(createUnlockProfile);
  const sessionRoom = useRef(
    createRoom({
      roomId: roomContext.roomId,
      ownerId: roomContext.participantId,
      ownerName: 'Owner',
      unlocks: createUnlockProfile(),
    }),
  );
  const application = useRef<ReturnType<typeof createLocalApplication> | null>(
    null,
  );
  const [storageNotice, setStorageNotice] = useState('');
  const controller = useRef<SessionController | null>(null);
  const lastSnapshot = useRef<string | null>(null);
  const lastIntent = useRef<string | null>(null);
  const submittedPlans = useRef(new Map<string, number>());
  const draftsDirty = useRef(false);
  const hydratingSnapshot = useRef(false);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const [peers, setPeers] = useState<SessionPresence[]>([]);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>({
    mode: 'local',
    state: 'connecting',
    message: 'Session wird geöffnet …',
    sessionId: null,
    link: null,
    revision: null,
  });
  const [factory, setFactory] = useState(() => ({
    input: firstInput,
    plan: solveProduction(catalog, firstInput),
    technology: firstTechnology,
    rows: 0,
    variant: defaultBuildVariant,
  }));
  const [target, setTarget] = useState(firstInput.targets[0]!.itemId);
  const [rate, setRate] = useState('20');
  const [additionalTargets, setAdditionalTargets] = useState<
    ProductionInput['targets']
  >([]);
  const [targetsExpanded, setTargetsExpanded] = useState(true);
  const [sizingMode, setSizingMode] = useState<'target' | 'input'>('target');
  const [inputScope, setInputScope] = useState<'factory' | 'stage'>('factory');
  const [inputStageItem, setInputStageItem] = useState('');
  const [inputItem, setInputItem] = useState('');
  const [inputRate, setInputRate] = useState('180');
  const [choices, setChoices] = useState(firstInput.recipes);
  const [selected, setSelected] = useState(() => firstStage(factory.plan));
  const [selectedMachine, setSelectedMachine] = useState(1);
  function selectStage(itemId: string) {
    setSelected(itemId);
    setSelectedMachine(1);
  }
  const [preferences, setPreferences] = useState(() =>
    restorePreferences(initialView),
  );
  const [ready, setReady] = useState(false);
  const [width, setWidth] = useState(1200);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [motion, setMotion] = useState(false);
  const [visible, setVisible] = useState(true);
  const [profileDraft, setProfileDraft] = useState(firstTechnology);
  const [tier, setTier] = useState<number | 'custom'>(2);
  const [phase, setPhase] = useState(0);
  const [search, setSearch] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const sequence = useRef(0);
  const draftDirty = draftsDirty;
  const draftRevision = useRef(shared?.revision ?? 0);
  const [, refreshDraftStatus] = useState(0);
  function markDraft() {
    if (!draftDirty.current) draftRevision.current = shared?.revision ?? 0;
    draftDirty.current = true;
  }
  const profileRevision = useRef(0);
  const planMatchesSession =
    JSON.stringify(factory.technology) ===
    JSON.stringify(sessionProfile.technology);
  // Controller hydration can make `ready` visible before React applies its profile state.
  // Keep the authoritative room profile ahead of persistence and editable controls.
  const workspaceReady =
    ready &&
    (!!shared ||
      canonical(sessionProfile) === canonical(sessionRoom.current.unlocks));
  const presentation = effectivePresentation(preferences, width);
  useEffect(() => {
    if (!workspaceReady || shared) return;
    const room = sessionRoom.current;
    const app = createLocalApplication(
      room,
      { roomId: room.id, participantId: 'workspace-owner' },
      catalog,
      (next) => {
        sessionRoom.current = next;
        if (next.unlocks) setSessionProfile(next.unlocks);
      },
    );
    application.current = app;
    const register = () =>
      registerWebMcp(
        document as Document & { modelContext?: ModelContext },
        app.execute,
      );
    let handle = register();
    const dispose = () => {
      try {
        handle.dispose();
      } catch {
        // The adapter deactivates callbacks before cleanup; unmount retries pending removals.
      }
    };
    const resume = (event: PageTransitionEvent) => {
      if (event.persisted) {
        dispose();
        handle = register();
      }
    };
    window.addEventListener('pagehide', dispose);
    window.addEventListener('pageshow', resume);
    return () => {
      window.removeEventListener('pagehide', dispose);
      window.removeEventListener('pageshow', resume);
      dispose();
      application.current = null;
    };
  }, [workspaceReady, sessionEpoch]);
  useEffect(() => {
    const restored =
      shared?.plan.unlocks ??
      loadUnlockProfile(
        sessionUnlockStorage,
        browserUnlockStorage,
        roomContext,
      );
    sessionRoom.current = createRoom({
      roomId: roomContext.roomId,
      ownerId: roomContext.participantId,
      ownerName: 'Owner',
      unlocks: restored,
    });
    setSessionProfile(restored);
    // Existing sessions must be read independently of the browser's unlock defaults.
    // A new session may retain a last valid seed plan as visibly outdated.
    let initialPlan: SessionPlan = planFileSchema.parse({
      schemaVersion: 1,
      catalogVersion: catalog.catalogVersion,
      production: firstInput,
      unlocks: restored,
      layout: { rows: 0, variant: defaultBuildVariant },
    });
    let disposed = false;
    try {
      if (shared) {
        hydrateShared(shared.plan, true);
      } else {
        const recipes = availableChoices(
          restored.technology,
          firstInput.imports,
        );
        const itemId = recipes[firstInput.targets[0]!.itemId]
          ? firstInput.targets[0]!.itemId
          : Object.keys(recipes)[0];
        if (!itemId)
          throw new Error(
            'Keine berechenbaren Produktionsziele freigeschaltet.',
          );
        const input = {
          ...firstInput,
          recipes,
          technology: restored.technology,
          targets: [{ itemId, rate: '20' }],
        };
        const next = evaluate(
          input,
          restored.technology,
          0,
          defaultBuildVariant,
        );
        initialPlan = planFileSchema.parse({
          schemaVersion: 1,
          catalogVersion: catalog.catalogVersion,
          production: next.input,
          unlocks: restored,
          layout: { rows: next.rows, variant: next.variant },
        });
        setFactory(next);
        setTarget(itemId);
        setChoices(recipes);
        selectStage(firstStage(next.plan));
      }
    } catch {
      // Empty/infeasible unlock defaults must not prevent restoring a saved plan.
    }
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) setPreferences(restorePreferences(JSON.parse(saved)));
    } catch {
      /* safe local defaults */
    }
    const resize = () =>
      setWidth(Math.max(1, Math.min(65536, window.innerWidth)));
    const visibility = () => setVisible(!document.hidden);
    resize();
    visibility();
    if (shared) {
      setReady(true);
    } else {
      const receive = (snapshot: SessionSnapshot) => {
        if (disposed) return;
        const document = planFileSchema.parse(snapshot.plan);
        const serialized = JSON.stringify(document);
        const ownAcknowledgement =
          lastSnapshot.current !== null &&
          submittedPlans.current.has(serialized);
        if (ownAcknowledgement) {
          const remaining = (submittedPlans.current.get(serialized) ?? 1) - 1;
          if (remaining) submittedPlans.current.set(serialized, remaining);
          else submittedPlans.current.delete(serialized);
          lastSnapshot.current = serialized;
          return;
        }
        const profile =
          document.unlocks ??
          validateUnlockProfile({
            ...createUnlockProfile(),
            hubTier: null,
            technology:
              document.production.technology ??
              createUnlockProfile().technology,
          });
        const technology = document.production.technology ?? profile.technology;
        const next = evaluate(
          document.production,
          technology,
          document.layout.rows,
          document.layout.variant,
          false,
        );
        lastSnapshot.current = serialized;
        lastIntent.current = serialized;
        sequence.current++;
        setPending(false);
        hydratingSnapshot.current = true;
        sessionRoom.current = {
          ...createRoom({
            roomId: roomContext.roomId,
            ownerId: roomContext.participantId,
            ownerName: 'Owner',
            unlocks: profile,
          }),
          revision: snapshot.revision,
        };
        setSessionProfile(profile);
        setFactory(next);
        if (!draftsDirty.current) {
          updateTargetRows(next.input.targets);
          setChoices({
            ...availableChoices(technology, next.input.imports),
            ...next.input.recipes,
          });
          setSizingMode('target');
          setInputItem('');
        }
        setSelected((previous) =>
          next.plan.nodes.some((n) => n.itemId === previous)
            ? previous
            : firstStage(next.plan),
        );
        setSessionEpoch((epoch) => epoch + 1);
      };
      const session = createSessionController({
        initialPlan,
        localOnly,
        onSnapshot: receive,
        onStatus: (status) => {
          if (!disposed) setSessionStatus(status);
        },
        onPresence: (next) => {
          if (!disposed) setPeers(next);
        },
      });
      controller.current = session;
      void session
        .start()
        .then((snapshot) => {
          if (!disposed) {
            if (lastSnapshot.current === null) receive(snapshot);
            setReady(true);
          }
        })
        .catch((e: unknown) => {
          if (!disposed) {
            setError('Sitzung: ' + message(e));
            setReady(true);
          }
        });
    }
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      controller.current?.close();
      controller.current = null;
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
      sequence.current++;
    };
  }, []);
  useEffect(() => {
    if (!workspaceReady) return;
    if (shared) return;
    const saved = saveUnlockProfile(
      sessionUnlockStorage,
      browserUnlockStorage,
      roomContext,
      sessionProfile,
    );
    setStorageNotice(
      saved.session && saved.browser
        ? ''
        : 'Browser-Speicherung eingeschränkt. Die Freischaltungen gelten weiterhin für die laufende Sitzung.',
    );
    if (hydratingSnapshot.current) {
      hydratingSnapshot.current = false;
      return;
    }
    if (
      JSON.stringify(sessionProfile.technology) ===
      JSON.stringify(factory.technology)
    )
      return;
    sequence.current++;
    setPending(false);
    try {
      const allowed = new Set(
        feasibleRecipes(sessionProfile.technology, factory.input.imports).map(
          (r) => r.id,
        ),
      );
      const recipes = {
        ...availableChoices(sessionProfile.technology, factory.input.imports),
        ...Object.fromEntries(
          Object.entries(factory.input.recipes).filter(([, id]) =>
            allowed.has(id),
          ),
        ),
      };
      const next = evaluate(
        { ...factory.input, recipes },
        sessionProfile.technology,
      );
      setFactory(next);
      setChoices(recipes);
      setError('');
    } catch (e) {
      const defaults = availableChoices(
        sessionProfile.technology,
        factory.input.imports,
      );
      setChoices(defaults);
      if (!defaults[target] && Object.keys(defaults)[0])
        setTarget(Object.keys(defaults)[0]!);
      setError(
        'Sitzungsfreischaltungen geändert. Der bisherige Plan ist damit nicht berechenbar: ' +
          message(e),
      );
    }
  }, [workspaceReady, sessionProfile]);
  useEffect(() => {
    const session = controller.current;
    if (!workspaceReady || !session || lastSnapshot.current === null) return;
    const document = planFileSchema.parse({
      schemaVersion: 1,
      catalogVersion: catalog.catalogVersion,
      production: factory.input,
      unlocks: sessionProfile,
      layout: { rows: factory.rows, variant: factory.variant },
    });
    const serialized = JSON.stringify(document);
    if (serialized === lastIntent.current) return;
    lastIntent.current = serialized;
    submittedPlans.current.set(
      serialized,
      (submittedPlans.current.get(serialized) ?? 0) + 1,
    );
    void session.commit(document).catch((e: unknown) => setError(message(e)));
  }, [workspaceReady, factory, sessionProfile]);
  useEffect(() => {
    if (!ready) return;
    controller.current?.setPresence({
      view: presentation.preset === 'production' ? 'production' : 'layout',
      floor: presentation.preset === 'production' ? 'production' : selected,
      cursor: null,
    });
  }, [ready, presentation.preset, selected]);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(KEY, JSON.stringify(preferences));
      } catch {
        /* storage optional */
      }
  }, [ready, preferences]);
  useEffect(() => {
    if (profileOpen) dialog.current?.showModal();
  }, [profileOpen]);
  function hydrateShared(plan: SharedPlan, resetDraft = false) {
    const next = evaluate(
      plan.production,
      plan.unlocks.technology,
      plan.layout.rows,
      plan.layout.variant,
      false,
    );
    setFactory(next);
    setSessionProfile(plan.unlocks);
    if (!next.plan.nodes.some((n) => n.itemId === selected))
      selectStage(firstStage(next.plan));
    if (resetDraft || !draftDirty.current) {
      updateTargetRows(plan.production.targets);
      setChoices(plan.production.recipes);
    }
  }
  useEffect(() => {
    if (shared && ready) {
      sequence.current++;
      setPending(false);
      hydrateShared(shared.plan);
    }
  }, [shared?.plan]);
  function planDocument(
    next: typeof factory,
    unlocks = sessionProfile,
  ): SharedPlan {
    return {
      schemaVersion: 1,
      catalogVersion: catalog.catalogVersion,
      unlocks,
      production: next.input,
      layout: { rows: next.rows, variant: next.variant },
    };
  }
  const candidates = useMemo(
    () => feasibleRecipes(sessionProfile.technology, factory.input.imports),
    [sessionProfile.technology, factory.input.imports],
  );
  const manufactured = useMemo(() => {
    const defaults = availableChoices(
      sessionProfile.technology,
      factory.input.imports,
    );
    return catalog.items.filter((item) => {
      if (item.raw || !defaults[item.id]) return false;
      try {
        solveProduction(catalog, {
          targets: [{ itemId: item.id, rate: '1' }],
          recipes: defaults,
          imports: factory.input.imports,
          technology: sessionProfile.technology,
        });
        return true;
      } catch {
        return false;
      }
    });
  }, [sessionProfile.technology, factory.input.imports]);
  const sizingPlan = useMemo(() => {
    try {
      return calculateProduction(
        catalog,
        {
          ...factory.input,
          recipes: choices,
          technology: sessionProfile.technology,
        },
        [
          { itemId: target, rate: '1' },
          ...additionalTargets.map((entry) => ({ ...entry, rate: '1' })),
        ],
      ).plan;
    } catch {
      return undefined;
    }
  }, [
    factory.input,
    choices,
    target,
    additionalTargets,
    sessionProfile.technology,
  ]);
  const sizingStage =
    sizingPlan?.nodes.find(
      (node) => node.itemId === (inputStageItem || selected),
    )?.itemId ??
    sizingPlan?.nodes.find((node) => node.itemId === target)?.itemId ??
    sizingPlan?.nodes[0]?.itemId ??
    '';
  const sizingInputs = sizingPlan
    ? productionSizingInputs(
        sizingPlan,
        inputScope === 'factory'
          ? { scope: 'factory' }
          : { scope: 'stage', stageItemId: sizingStage },
      )
    : [];
  const sizingInput =
    sizingInputs.find((entry) => entry.itemId === inputItem)?.itemId ??
    sizingInputs[0]?.itemId ??
    '';
  const supplyLayout = useMemo(
    () =>
      generateSupplyLayout(
        catalog,
        factory.plan,
        factory.technology,
        factory.rows,
        factory.variant,
      ),
    [factory],
  );
  function evaluate(
    input: ProductionInput,
    technology: TechnologyProfile,
    rows = factory.rows,
    variant: BuildVariant = factory.variant,
    pruneOverrides = true,
  ) {
    const resolved = { ...input, technology };
    const plan = solveProduction(catalog, resolved);
    const normalized = pruneOverrides
      ? {
          ...variant,
          overrides: variant.overrides.filter((o) =>
            plan.nodes.some((n) => n.itemId === o.itemId),
          ),
        }
      : variant;
    generateSupplyLayout(catalog, plan, technology, rows, normalized);
    return { input: resolved, plan, technology, rows, variant: normalized };
  }
  async function apply(
    input: ProductionInput,
    technology = sessionProfile.technology,
    rows = factory.rows,
    variant: BuildVariant = factory.variant,
    expectedRevision = shared?.revision ?? 0,
  ) {
    sequence.current++;
    setPending(false);
    const next = evaluate(input, technology, rows, variant);
    if (shared) {
      const document = planDocument(next);
      const independent = diffPlan(planDocument(factory), document).every(
        (change) => change.field === 'rows' || change.field === 'variant',
      );
      const preservedDraft =
        draftDirty.current && draftRevision.current === expectedRevision;
      const saved = await shared.onEdit(document, expectedRevision);
      // Rebase only across our own acknowledged layout edit. A newer snapshot,
      // or an already-stale draft, still requires explicit conflict resolution.
      if (
        independent &&
        preservedDraft &&
        draftDirty.current &&
        draftRevision.current === expectedRevision &&
        saved.revision >= expectedRevision &&
        saved.revision <= expectedRevision + 1 &&
        canonical(saved.plan) === canonical(document)
      ) {
        draftRevision.current = saved.revision;
        refreshDraftStatus((version) => version + 1);
      }
    } else setFactory(next);
    setError('');
    if (!next.plan.nodes.some((n) => n.itemId === selected))
      selectStage(firstStage(next.plan));
    return next;
  }
  function resolveDraft() {
    const result = calculateProduction(
      catalog,
      {
        ...factory.input,
        recipes: choices,
        technology: sessionProfile.technology,
      },
      [{ itemId: target, rate }, ...additionalTargets].map((entry) => ({
        ...entry,
        rate:
          sizingMode === 'input' && !entry.rate.trim()
            ? (factory.input.targets.find(
                (previous) => previous.itemId === entry.itemId,
              )?.rate ?? '1')
            : entry.rate,
      })),
    );
    return sizingMode === 'input'
      ? sizeProductionByInput(
          catalog,
          result.input,
          inputScope === 'factory'
            ? {
                scope: 'factory',
                itemId: sizingInput,
                rate: Rational.parse(
                  inputRate.trim().replace(',', '.'),
                ).toString(),
              }
            : {
                scope: 'stage',
                stageItemId: sizingStage,
                itemId: sizingInput,
                rate: Rational.parse(
                  inputRate.trim().replace(',', '.'),
                ).toString(),
              },
        )
      : result;
  }
  function updateTargetRows(targets: ProductionInput['targets']) {
    setTarget(targets[0]!.itemId);
    setRate(formatRateInput(targets[0]!.rate));
    setAdditionalTargets(
      targets
        .slice(1)
        .map((entry) => ({ ...entry, rate: formatRateInput(entry.rate) })),
    );
  }
  async function calculate() {
    sequence.current++;
    setPending(false);
    try {
      const result = resolveDraft();
      const next = await apply(
        result.input,
        sessionProfile.technology,
        factory.rows,
        factory.variant,
        draftDirty.current ? draftRevision.current : (shared?.revision ?? 0),
      );
      updateTargetRows(next.input.targets);
      draftsDirty.current = false;
    } catch (e) {
      setError(message(e));
    }
  }
  async function updateSessionProfile(
    profile: UnlockProfile,
    expectedRevision = sessionRoom.current.revision,
  ) {
    const app = application.current;
    if (!app) throw new Error('Session ist noch nicht bereit.');
    const result = await app.execute('apply_command', {
      roomId: roomContext.roomId,
      command: {
        id: crypto.randomUUID(),
        expectedRevision,
        command: { type: 'set-unlocks', profile },
      },
    });
    if (!result.ok)
      throw new Error(
        result.error?.code === 'revision-conflict'
          ? 'Die Sitzung wurde inzwischen geändert. Bitte öffne die Einstellungen erneut.'
          : (result.error?.message ??
            'Sitzungsfreischaltungen konnten nicht gespeichert werden.'),
      );
  }
  async function importPlan(file: File) {
    const id = ++sequence.current;
    const expectedRevision = shared?.revision ?? sessionRoom.current.revision;
    setPending(true);
    try {
      if (file.size > 1_000_000)
        throw new Error('Plan überschreitet das Größenlimit.');
      const document = planFileSchema.parse(JSON.parse(await file.text()));
      if (document.catalogVersion !== catalog.catalogVersion)
        throw new Error(
          `Plan- oder Katalogversion passt nicht. Erwartet wird die Datenbasis für Satisfactory ${catalog.provenance.manifest!.gameVersion}.`,
        );
      const input = document.production;
      const technology =
        input.technology ??
        document.unlocks?.technology ??
        sessionProfile.technology;
      const importedProfile =
        document.unlocks ??
        validateUnlockProfile({ ...sessionProfile, hubTier: null, technology });
      if (
        JSON.stringify(importedProfile.technology) !==
        JSON.stringify(technology)
      )
        throw new Error(
          'Plan und Sitzungsfreischaltungen passen nicht zusammen.',
        );
      const next = evaluate(
        input,
        technology,
        document.layout.rows,
        document.layout.variant,
        false,
      );
      if (id !== sequence.current) return;
      if (shared)
        await shared.onEdit(
          planDocument(next, importedProfile),
          expectedRevision,
        );
      else {
        await updateSessionProfile(importedProfile, expectedRevision);
        setFactory(next);
      }
      draftDirty.current = false;
      updateTargetRows(input.targets);
      setSizingMode('target');
      setInputItem('');
      setChoices({
        ...availableChoices(technology, input.imports),
        // Only reachable overrides were validated by the solver during import.
        ...Object.fromEntries(
          next.plan.nodes.map((node) => [node.itemId, node.recipeId]),
        ),
      });
      selectStage(primaryStage(input, next.plan));
      setError('');
    } catch (e) {
      if (id === sequence.current) setError(message(e));
    } finally {
      if (id === sequence.current) setPending(false);
    }
  }
  async function exportPlan() {
    if (!planMatchesSession) return;
    let exported = factory;
    try {
      exported = await apply(resolveDraft().input);
      updateTargetRows(exported.input.targets);
      draftsDirty.current = false;
    } catch (e) {
      setError(
        `Entwurf ungültig: ${message(e)} Exportiert wurde der letzte gültige Plan.`,
      );
    }
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              schemaVersion: 1,
              catalogVersion: catalog.catalogVersion,
              unlocks: sessionProfile,
              production: exported.input,
              layout: { rows: exported.rows, variant: exported.variant },
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'satispire-plan.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }
  const panel = (name: 'navigation' | 'graph' | 'inspector') =>
    setPreferences((p) =>
      updateViewPreferences(p, { panels: { [name]: !p.panels[name] } }),
    );
  const stage =
    factory.plan.nodes.find((n) => n.itemId === selected) ??
    factory.plan.nodes[0]!;
  const perMachineRate = (rate: string) =>
    Rational.parseCanonical(rate)
      .divide(Rational.parse(String(stage.machineCount)))
      .toString();
  const clockComparison = Rational.parseCanonical(stage.utilization).compare(
    Rational.parse('1'),
  );
  const clockStatus =
    clockComparison < 0
      ? 'Untertaktet'
      : clockComparison > 0
        ? 'Übertaktet'
        : 'Standardtakt';
  const stageFloor = supplyLayout.floors.find(
    (floor) => floor.itemId === stage.itemId,
  )!;
  const machineGeometry = stageFloor.machineGeometry;
  function openProfile() {
    profileRevision.current = shared?.revision ?? sessionRoom.current.revision;
    setProfileDraft(structuredClone(sessionProfile.technology));
    setSearch('');
    setTier(sessionProfile.hubTier ?? 'custom');
    setPhase(sessionProfile.spaceElevatorPhase);
    setError('');
    setProfileOpen(true);
  }
  function closeProfile() {
    dialog.current?.close();
    setProfileOpen(false);
  }
  async function applyProfile() {
    try {
      const allowed = new Set(
        feasibleRecipes(profileDraft, factory.input.imports).map((r) => r.id),
      );
      const active = new Set(factory.plan.nodes.map((node) => node.itemId));
      const previousDefaults = availableChoices(
        factory.technology,
        factory.input.imports,
      );
      const recipes = {
        ...availableChoices(profileDraft, factory.input.imports),
        ...Object.fromEntries(
          Object.entries(factory.input.recipes).filter(
            ([itemId, id]) => active.has(itemId) && allowed.has(id),
          ),
        ),
      };
      const profile = validateUnlockProfile({
        ...sessionProfile,
        technology: profileDraft,
        hubTier: tier === 'custom' ? null : tier,
        spaceElevatorPhase: phase,
      });
      const next = evaluate({ ...factory.input, recipes }, profileDraft);
      if (shared)
        await shared.onEdit(
          planDocument(next, profile),
          profileRevision.current,
        );
      else {
        await updateSessionProfile(profile, profileRevision.current);
        await apply({ ...factory.input, recipes }, profileDraft);
      }
      setChoices({
        ...recipes,
        ...Object.fromEntries(
          Object.entries(choices).filter(
            ([itemId, id]) =>
              allowed.has(id) &&
              (id !==
                (factory.input.recipes[itemId] ?? previousDefaults[itemId]) ||
                id !== previousDefaults[itemId]),
          ),
        ),
      });
      closeProfile();
    } catch (e) {
      setError(message(e));
    }
  }
  function toggleProfile(
    field: 'availableMachines' | 'unlockedRecipes',
    id: string,
    checked: boolean,
  ) {
    setTier('custom');
    setProfileDraft((p) => ({
      ...p,
      [field]: checked
        ? [...new Set([...p[field], id])]
        : p[field].filter((v) => v !== id),
    }));
  }
  const cameraControls = (
    <>
      <label>
        Reihen
        <select
          aria-label="Reihen"
          value={factory.rows}
          onChange={(e) => {
            try {
              void apply(
                factory.input,
                sessionProfile.technology,
                Number(e.target.value),
              ).catch((err) => setError(message(err)));
            } catch (err) {
              setError(message(err));
            }
          }}
        >
          <option value="0">Automatisch</option>
          {[1, 2, 3, 4, 6, 8].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </>
  );
  return (
    <main className="workspace" data-ready={workspaceReady ? 'true' : 'false'}>
      <fieldset
        className="workspace hydration-boundary"
        disabled={!workspaceReady || shared?.busy}
      >
        <header className="app-header">
          <h1>Satispire</h1>
          <span
            className="project-name"
            title={sessionStatus.sessionId ?? undefined}
          >
            {sessionStatus.sessionId
              ? `Sitzung ${sessionStatus.sessionId.slice(0, 8)}`
              : 'Meine Fabrik'}
          </span>
          {!shared && (
            <span
              className="session-status"
              aria-label="Sitzungsstatus"
              role="status"
              title={sessionStatus.message}
            >
              {sessionStatus.mode === 'local' ? 'Lokal · ' : ''}
              {sessionStatus.state === 'saved' ||
              sessionStatus.state === 'ready'
                ? 'Gespeichert'
                : sessionStatus.message}
            </span>
          )}
          {!shared && sessionStatus.mode === 'online' && sessionStatus.link && (
            <button
              type="button"
              className="session-share"
              onClick={() => {
                void navigator.clipboard
                  .writeText(sessionStatus.link!)
                  .catch(() =>
                    setError(
                      'Der Sitzungslink steht in der Adresszeile und kann dort kopiert werden.',
                    ),
                  );
              }}
            >
              Sitzungslink kopieren
            </button>
          )}
          <span className="catalog-version" title={catalog.catalogVersion}>
            Vanilla {catalog.provenance.manifest!.gameVersion}
          </span>
          <form
            className="planning-controls"
            onChangeCapture={markDraft}
            data-sizing-mode={sizingMode}
            onSubmit={(e) => {
              e.preventDefault();
              void calculate();
            }}
          >
            <details
              className="target-editor"
              open={targetsExpanded}
              onToggle={(e) => {
                setTargetsExpanded(e.currentTarget.open);
              }}
            >
              <summary>
                Produktionsziele ({additionalTargets.length + 1})
              </summary>
              <div className="target-editor-panel">
                {[{ itemId: target, rate }, ...additionalTargets].map(
                  (entry, index) => (
                    <div className="target-row" key={index}>
                      <select
                        id={index === 0 ? 'target' : undefined}
                        aria-label={
                          index === 0
                            ? 'Produktionsziel'
                            : `Produktionsziel ${index + 1}`
                        }
                        value={entry.itemId}
                        disabled={pending}
                        onChange={(e) => {
                          if (index === 0) setTarget(e.target.value);
                          else
                            setAdditionalTargets((entries) =>
                              entries.map((value, i) =>
                                i === index - 1
                                  ? { ...value, itemId: e.target.value }
                                  : value,
                              ),
                            );
                        }}
                      >
                        {!manufactured.some(
                          (item) => item.id === entry.itemId,
                        ) && (
                          <option value={entry.itemId}>
                            {itemName(entry.itemId)}
                          </option>
                        )}
                        {manufactured.map((item) => (
                          <option key={item.id} value={item.id}>
                            {itemName(item.id, item.name)}
                          </option>
                        ))}
                      </select>
                      <input
                        id={index === 0 ? 'rate' : undefined}
                        aria-label={
                          index === 0
                            ? 'Zielrate pro Minute'
                            : `Zielrate pro Minute ${index + 1}`
                        }
                        value={entry.rate}
                        inputMode="decimal"
                        title="Menge pro Minute; Dezimalzahl oder Bruch"
                        disabled={pending || sizingMode === 'input'}
                        onChange={(e) => {
                          if (index === 0) setRate(e.target.value);
                          else
                            setAdditionalTargets((entries) =>
                              entries.map((value, i) =>
                                i === index - 1
                                  ? { ...value, rate: e.target.value }
                                  : value,
                              ),
                            );
                        }}
                      />
                      <span className="rate-unit">/ min</span>
                      <button
                        type="button"
                        aria-label={`Ziel ${index + 1} entfernen`}
                        disabled={pending || additionalTargets.length === 0}
                        onClick={() => {
                          markDraft();
                          if (index === 0) {
                            setTarget(additionalTargets[0]!.itemId);
                            setRate(additionalTargets[0]!.rate);
                            setAdditionalTargets((entries) => entries.slice(1));
                          } else
                            setAdditionalTargets((entries) =>
                              entries.filter((_, i) => i !== index - 1),
                            );
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ),
                )}
                <button
                  type="button"
                  className="add-target"
                  disabled={
                    pending ||
                    additionalTargets.length >= INPUT_ENTRY_LIMIT - 1 ||
                    !manufactured.some(
                      (item) =>
                        item.id !== target &&
                        !additionalTargets.some(
                          (entry) => entry.itemId === item.id,
                        ),
                    )
                  }
                  onClick={() => {
                    markDraft();
                    const item = manufactured.find(
                      (item) =>
                        item.id !== target &&
                        !additionalTargets.some(
                          (entry) => entry.itemId === item.id,
                        ),
                    );
                    if (item)
                      setAdditionalTargets((entries) => [
                        ...entries,
                        { itemId: item.id, rate: '20' },
                      ]);
                  }}
                >
                  Ziel hinzufügen
                </button>
              </div>
            </details>
            <div className="planning-actions">
              <div
                className={`sizing-expression${sizingMode === 'input' ? ' is-input' : ''}`}
              >
                <label className="sr-only" htmlFor="sizing-mode">
                  Berechnungsmodus
                </label>
                <select
                  id="sizing-mode"
                  className="sizing-mode"
                  value={sizingMode}
                  onChange={(event) =>
                    setSizingMode(event.target.value as 'target' | 'input')
                  }
                  disabled={pending}
                >
                  <option value="target">Zielmengen festlegen</option>
                  <option value="input">Alle Ziele skalieren auf</option>
                </select>
                {sizingMode === 'input' && (
                  <>
                    <div className="sizing-amount">
                      <label className="sr-only" htmlFor="input-rate">
                        Eingangsmenge pro Minute
                      </label>
                      <input
                        id="input-rate"
                        value={inputRate}
                        onChange={(event) => setInputRate(event.target.value)}
                        title="Dezimalzahl oder Bruch, z. B. 7,5 oder 15/2"
                        inputMode="decimal"
                        disabled={pending}
                      />
                      <span className="rate-unit">
                        {catalog.items.find((item) => item.id === sizingInput)
                          ?.transport === 'pipe'
                          ? 'm³/min'
                          : 'Stk./min'}
                      </span>
                    </div>
                    <label className="sr-only" htmlFor="input-item">
                      Verfügbares Material
                    </label>
                    <select
                      id="input-item"
                      value={sizingInput}
                      onChange={(event) => setInputItem(event.target.value)}
                      disabled={pending || sizingInputs.length === 0}
                    >
                      {sizingInputs.length === 0 && (
                        <option value="">Kein verfügbares Material</option>
                      )}
                      {sizingInputs.map((entry) => (
                        <option key={entry.itemId} value={entry.itemId}>
                          {itemName(entry.itemId)}
                        </option>
                      ))}
                    </select>
                    <label className="sr-only" htmlFor="input-scope">
                      Skalierungsbezug
                    </label>
                    <select
                      id="input-scope"
                      value={
                        inputScope === 'factory'
                          ? 'factory'
                          : `stage:${sizingStage}`
                      }
                      onChange={(event) => {
                        const value = event.target.value;
                        setInputScope(
                          value === 'factory' ? 'factory' : 'stage',
                        );
                        if (value !== 'factory')
                          setInputStageItem(value.slice('stage:'.length));
                      }}
                      disabled={pending}
                    >
                      <option value="factory">Verbrauch gesamte Fabrik</option>
                      {sizingPlan?.nodes
                        .filter((node) => node.inputs.length > 0)
                        .map((node) => (
                          <option
                            key={node.itemId}
                            value={`stage:${node.itemId}`}
                          >
                            Eingang: {itemName(node.itemId)}
                          </option>
                        ))}
                    </select>
                  </>
                )}
              </div>
              <button className="primary" type="submit" disabled={pending}>
                Plan berechnen
              </button>
              <button
                type="button"
                className="technology-button"
                onClick={openProfile}
              >
                <Icon name="technology" />
                Technologie
              </button>
            </div>
          </form>
          <div className="header-actions">
            {(['navigation', 'graph', 'inspector'] as const).map((name) => (
              <button
                key={name}
                className="icon-button"
                aria-label={
                  name === 'navigation'
                    ? 'Navigation'
                    : name === 'graph'
                      ? 'Graph'
                      : 'Details'
                }
                title={
                  name === 'navigation'
                    ? 'Navigation'
                    : name === 'graph'
                      ? 'Graph'
                      : 'Details'
                }
                aria-pressed={presentation.panels[name]}
                disabled={name === 'navigation' && width < 1200}
                onClick={() => panel(name)}
              >
                <Icon name={name} />
              </button>
            ))}
            <label
              className="file-control icon-button"
              title="Plan importieren"
            >
              <Icon name="import" />
              <span className="sr-only">Plan importieren</span>
              <input
                type="file"
                accept=".json"
                aria-label="Plan-Datei"
                disabled={pending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void importPlan(file);
                }}
              />
            </label>
            {shared ? (
              shared.controls
            ) : (
              <button
                className="icon-button"
                aria-label="Plan exportieren"
                title="Plan exportieren"
                onClick={exportPlan}
                disabled={!planMatchesSession}
              >
                <Icon name="export" />
              </button>
            )}
          </div>
        </header>

        {error && !profileOpen && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {shared &&
          draftDirty.current &&
          draftRevision.current !== shared.revision && (
            <div className="error-banner" role="status">
              Der Raum hat neuere Änderungen. Dein Entwurf bleibt erhalten.
              <button
                onClick={() => {
                  draftDirty.current = false;
                  hydrateShared(shared.plan, true);
                  setError('');
                }}
              >
                Aktuellen Stand übernehmen
              </button>
            </div>
          )}
        {storageNotice && (
          <div role="status" className="error-banner">
            {storageNotice}
          </div>
        )}
        {!planMatchesSession && !profileOpen && (
          <div role="status" className="error-banner">
            Der angezeigte Plan verwendet frühere Sitzungsfreischaltungen. Wähle
            ein freigeschaltetes Ziel und berechne ihn erneut.
          </div>
        )}
        <div className="workspace-body">
          {presentation.panels.navigation && (
            <aside className="navigation-panel" aria-label="Stufennavigation">
              <h2>Produktion</h2>
              {supplyLayout.floors.map((n, i) => (
                <button
                  key={n.itemId}
                  className={
                    'stage-navigation ' +
                    (selected === n.itemId ? 'selected' : '')
                  }
                  aria-pressed={selected === n.itemId}
                  onClick={() => selectStage(n.itemId)}
                >
                  <span>
                    {i + 1}. {itemName(n.itemId)}
                  </span>
                  <strong>{formatRate(n.rate)} / min</strong>
                  <small>
                    {n.machineCount} × {itemName(n.machineId)}
                  </small>
                </button>
              ))}
              <h2>Rohstoffe</h2>
              <ul className="imports">
                {factory.plan.imports.map((i) => (
                  <li key={i.itemId}>
                    <span>{itemName(i.itemId)}</span>
                    <strong>{formatRate(i.rate)} / min</strong>
                  </li>
                ))}
              </ul>
            </aside>
          )}
          <div className="center-workspace">
            <div className="canvas-toolbar">
              <label>
                <span className="sr-only">Stufe auswählen</span>
                <select
                  aria-label="Stufe auswählen"
                  value={selected}
                  onChange={(e) => selectStage(e.target.value)}
                >
                  {supplyLayout.floors.map((n, i) => (
                    <option key={n.itemId} value={n.itemId}>
                      Etage {i + 1} · {itemName(n.itemId)}
                    </option>
                  ))}
                </select>
              </label>
              {width > 640 && cameraControls}
              <details
                className="view-options"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.currentTarget.open = false;
                    event.currentTarget.querySelector('summary')?.focus();
                  }
                }}
              >
                <summary>Ansicht</summary>
                <label>
                  Ansicht
                  <select
                    value={preferences.preset}
                    onChange={(e) =>
                      setPreferences((p) =>
                        updateViewPreferences(p, {
                          preset: e.target.value as ViewPreset,
                        }),
                      )
                    }
                  >
                    <option value="floors">Etagen</option>
                    <option value="production">Produktion</option>
                    <option value="split">Verknüpft</option>
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    aria-label="Bandmengen anzeigen"
                    checked={preferences.beltRates}
                    onChange={(event) =>
                      setPreferences((p) =>
                        updateViewPreferences(p, {
                          beltRates: event.target.checked,
                        }),
                      )
                    }
                  />{' '}
                  Bandmengen anzeigen
                </label>
                {width <= 640 && cameraControls}
                <label>
                  <input
                    type="checkbox"
                    aria-label="Flussindikatoren"
                    checked={motion}
                    onChange={(e) => setMotion(e.target.checked)}
                  />{' '}
                  Flussindikatoren
                </label>
              </details>
            </div>
            <div className={'views preset-' + presentation.preset}>
              {presentation.preset !== 'production' && (
                <FloorView
                  catalog={catalog}
                  plan={factory.plan}
                  technology={factory.technology}
                  selected={selected}
                  zoom={preferences.camera.zoom}
                  onZoomChange={(zoom) =>
                    setPreferences((p) =>
                      updateViewPreferences(p, { camera: { zoom } }),
                    )
                  }
                  rows={factory.rows}
                  variant={factory.variant}
                  changeVariant={(variant) => {
                    try {
                      void apply(
                        factory.input,
                        sessionProfile.technology,
                        factory.rows,
                        variant,
                      ).catch((e) => setError(message(e)));
                    } catch (e) {
                      setError(message(e));
                    }
                  }}
                  machine={Math.min(selectedMachine, stage.machineCount)}
                  showBeltRates={preferences.beltRates}
                  selectMachine={(id) => {
                    setSelectedMachine(id);
                    setPreferences((p) =>
                      updateViewPreferences(p, { panels: { inspector: true } }),
                    );
                  }}
                  motion={motion && visible}
                  compact={width <= 640}
                  peers={peers.filter(
                    (peer) => peer.view === 'layout' && peer.floor === selected,
                  )}
                  onPresence={(cursor) =>
                    controller.current?.setPresence({
                      view: 'layout',
                      floor: selected,
                      cursor,
                    })
                  }
                />
              )}
              {presentation.preset !== 'floors' && (
                <ProductionView
                  plan={factory.plan}
                  selected={selected}
                  select={selectStage}
                  onSizeInput={(stageItemId, itemId) => {
                    markDraft();
                    const entry = factory.plan.nodes
                      .find((node) => node.itemId === stageItemId)
                      ?.inputs.find((input) => input.itemId === itemId);
                    setSizingMode('input');
                    setInputScope('stage');
                    setInputStageItem(stageItemId);
                    setInputItem(itemId);
                    if (entry) setInputRate(formatRateInput(entry.rate));
                  }}
                  peers={peers.filter(
                    (peer) =>
                      peer.view === 'production' && peer.floor === 'production',
                  )}
                  onPresence={(cursor) =>
                    controller.current?.setPresence({
                      view: 'production',
                      floor: 'production',
                      cursor,
                    })
                  }
                />
              )}
              {presentation.panels.graph && (
                <Graph
                  catalog={catalog}
                  plan={factory.plan}
                  selected={selected}
                  select={selectStage}
                  motion={motion && visible}
                />
              )}
            </div>
          </div>
          {presentation.panels.inspector && (
            <aside className="inspector-panel" aria-label="Stufeninspector">
              <div className="inspector-identity">
                <svg viewBox="0 0 100 80" aria-hidden="true">
                  <MachineGlyph
                    machineId={stage.machineId}
                    feeds={stage.inputs.length}
                    inputItems={stage.inputs.map((input) => input.itemId)}
                    outputItem={stage.itemId}
                    selected
                  />
                </svg>
                <div>
                  <h2>{itemName(stage.itemId)}</h2>
                  <span className="machine-identity">
                    {itemName(stage.machineId)}{' '}
                    {Math.min(selectedMachine, stage.machineCount)}
                  </span>
                </div>
              </div>
              <dl>
                <dt>Aktives Rezept</dt>
                <dd>{itemName(stage.recipeId)}</dd>
                <dt>Stufenrate</dt>
                <dd>{formatRate(stage.rate)} / min</dd>
                <dt>Maschinen</dt>
                <dd>{stage.machineCount}</dd>
                <dt>Takt je Maschine</dt>
                <dd>
                  {formatPercent(stage.utilization)} · {clockStatus}
                </dd>
              </dl>
              <h3>Je Maschine</h3>
              <ul className="imports" aria-label="Mengen je Maschine">
                {[
                  ...stage.inputs.map((input) => ({
                    ...input,
                    direction: 'EIN',
                  })),
                  { itemId: stage.itemId, rate: stage.rate, direction: 'AUS' },
                ].map((flow) => (
                  <li key={`${flow.direction}:${flow.itemId}`}>
                    <span>
                      {flow.direction} · {itemName(flow.itemId)}
                    </span>
                    <strong>
                      {formatRate(perMachineRate(flow.rate))}{' '}
                      {catalog.items.find((item) => item.id === flow.itemId)
                        ?.transport === 'pipe'
                        ? 'm³/min'
                        : 'Stk./min'}
                    </strong>
                  </li>
                ))}
              </ul>
              {machineGeometry &&
                [
                  { label: 'Maschinenmaße', size: machineGeometry.bounds.size },
                  {
                    label: 'Baufreiraum',
                    size: machineGeometry.clearance.size,
                  },
                ].map(({ label, size }) => (
                  <section key={label}>
                    <h3>{label}</h3>
                    <dl role="group" aria-label={label}>
                      <dt>Breite</dt>
                      <dd>{size.width.toLocaleString('de-DE')} m</dd>
                      <dt>Tiefe</dt>
                      <dd>{size.depth.toLocaleString('de-DE')} m</dd>
                      <dt>Höhe</dt>
                      <dd>{size.height.toLocaleString('de-DE')} m</dd>
                    </dl>
                  </section>
                ))}
              <label>
                Rezept
                <select
                  aria-label="Rezept für diese Stufe"
                  value={choices[stage.itemId] ?? stage.recipeId}
                  onChange={(e) => {
                    markDraft();
                    setChoices((c) => ({
                      ...c,
                      [stage.itemId]: e.target.value,
                    }));
                  }}
                >
                  {candidates
                    .filter((r) => r.outputs[0]!.itemId === stage.itemId)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {itemName(r.id, r.name)}
                      </option>
                    ))}
                </select>
              </label>
              <h3>Versorgung der Stufe</h3>
              <ul className="imports">
                {[
                  ...stage.inputs,
                  { itemId: stage.itemId, rate: stage.rate },
                ].map((i) => (
                  <li key={i.itemId}>
                    <span>{itemName(i.itemId)}</span>
                    <strong>
                      {formatRate(i.rate)}{' '}
                      {catalog.items.find((item) => item.id === i.itemId)!
                        .transport === 'pipe'
                        ? 'm³/min'
                        : 'Stk./min'}{' '}
                      ·{' '}
                      {i.itemId === stage.itemId
                        ? stageFloor.transport.outputLines
                        : stageFloor.inputs.find(
                            (input) => input.itemId === i.itemId,
                          )!.lines}{' '}
                      {catalog.items.find((it) => it.id === i.itemId)!
                        .transport === 'pipe'
                        ? `Rohre Mk.${factory.technology.pipeTier}`
                        : `Bänder Mk.${factory.technology.beltTier}`}
                    </strong>
                  </li>
                ))}
              </ul>
              <SourceCredits />
            </aside>
          )}
        </div>
      </fieldset>
      {profileOpen && (
        <dialog
          ref={dialog}
          className="technology-dialog"
          aria-label="Technologieprofil"
          onCancel={(e) => {
            e.preventDefault();
            closeProfile();
          }}
        >
          <div className="dialog-heading">
            <h2>Technologieprofil</h2>
            <button aria-label="Schließen" onClick={closeProfile}>
              ×
            </button>
          </div>
          <div className="profile-controls">
            <label>
              HUB-Stufe
              <select
                aria-label="HUB-Stufe"
                value={tier}
                onChange={(e) => {
                  if (e.target.value === 'custom') return;
                  const next = Number(e.target.value);
                  setTier(next);
                  setProfileDraft(technologyAtTier(next));
                  setPhase((current) =>
                    Math.max(
                      current,
                      createUnlockProfile(next).spaceElevatorPhase,
                    ),
                  );
                }}
              >
                <option value="custom">Individuell</option>
                {Array.from({ length: 10 }, (_, n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Weltraumlift
              <select
                aria-label="Abgeschlossene Weltraumlift-Phase"
                value={phase}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setPhase(next);
                  const maxTier = MAX_HUB_TIER_BY_PHASE[next]!;
                  if (next < phase && (tier === 'custom' || tier > maxTier)) {
                    setTier(maxTier);
                    setProfileDraft(technologyAtTier(maxTier));
                  }
                }}
              >
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n === 0
                      ? 'Noch keine Phase'
                      : 'Phase ' + n + ' abgeschlossen'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Förderbänder
              <select
                aria-label="Maximale Förderbandstufe"
                value={profileDraft.beltTier}
                onChange={(e) => {
                  setTier('custom');
                  setProfileDraft((p) => ({
                    ...p,
                    beltTier: Number(e.target.value),
                  }));
                }}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    Mk.{n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Rohre
              <select
                aria-label="Maximale Rohrstufe"
                value={profileDraft.pipeTier}
                onChange={(e) => {
                  setTier('custom');
                  setProfileDraft((p) => ({
                    ...p,
                    pipeTier: Number(e.target.value),
                  }));
                }}
              >
                <option value="1">Mk.1</option>
                <option value="2">Mk.2</option>
              </select>
            </label>
          </div>
          <p className="profile-help">
            Gilt für die gesamte Sitzung. Alle Teilnehmer können die
            Freischaltungen ändern. Neue Sitzungen starten mit deinen zuletzt im
            Browser gespeicherten Einstellungen.
          </p>
          <p className="profile-help">
            HUB-Stufen sind Vorlagen. Eine niedrigere Weltraumlift-Phase
            begrenzt die Vorlage; einzelne Freischaltungen lassen sich
            anschließend individuell anpassen.
          </p>
          <h3>Maschinen</h3>
          <div className="machine-options">
            {catalog.machines.map((m) => (
              <label key={m.id}>
                <input
                  type="checkbox"
                  aria-label={'Maschine ' + itemName(m.id, m.name)}
                  checked={profileDraft.availableMachines.includes(m.id)}
                  onChange={(e) =>
                    toggleProfile('availableMachines', m.id, e.target.checked)
                  }
                />
                {itemName(m.id, m.name)}
              </label>
            ))}
          </div>
          <h3>Rezeptfreischaltungen</h3>
          <input
            type="search"
            aria-label="Rezepte suchen"
            placeholder="Rezepte suchen"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="recipe-options">
            {catalog.recipes
              .filter((r) =>
                `${itemName(r.id, r.name)} ${r.name}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((r) => (
                <label key={r.id}>
                  <input
                    type="checkbox"
                    aria-label={'Rezept ' + itemName(r.id, r.name)}
                    checked={profileDraft.unlockedRecipes.includes(r.id)}
                    onChange={(e) =>
                      toggleProfile('unlockedRecipes', r.id, e.target.checked)
                    }
                  />
                  <span>
                    {itemName(r.id, r.name)}
                    {recipeUnlocks[r.id]!.alternate ? ' · Alternativ' : ''}
                  </span>
                </label>
              ))}
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          <div className="dialog-actions">
            <button onClick={closeProfile}>Abbrechen</button>
            <button className="primary" onClick={() => void applyProfile()}>
              Profil anwenden
            </button>
          </div>
        </dialog>
      )}
    </main>
  );
}
