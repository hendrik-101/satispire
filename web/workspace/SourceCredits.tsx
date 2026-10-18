import referenceLicense from '../../docs/data/ProgressionPlanner-LICENSE.txt?raw';
import geometryLicense from '../../docs/data/SatisfactoryAI-LICENSE.txt?raw';
import { vanillaCatalog } from '../../src/domain/vanilla.js';
import { machineGeometrySnapshot } from '../../src/data/machine-geometry.js';

export function SourceCredits() {
  return (
    <details className="source-notices" aria-label="Quellen und Lizenzen">
      <summary>Quellen und Lizenzen</summary>
      <p>
        Produktionsdaten:{' '}
        <a href={vanillaCatalog.provenance.manifest!.sourceUrl}>
          Greg McDowell · MIT
        </a>
      </p>
      <pre>{referenceLicense}</pre>
      <p>
        Messdaten und ergänzende Artikelnamen:{' '}
        <a href={machineGeometrySnapshot.provenance.sourceUrl}>
          Aadit Sachdev · MIT
        </a>
      </p>
      <pre>{geometryLicense}</pre>
      <p>Satisfactory ist ein Spiel von Coffee Stain Studios.</p>
    </details>
  );
}
