import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import StrategyModule from './modules/strategy/StrategyModule';
import AnalysisModule from './modules/analysis/AnalysisModule';
import EntryPointModule from './modules/entry-point/EntryPointModule';

type ModuleId = 'strategy' | 'analysis' | 'entry';

const MODULES: Record<ModuleId, { name: string; description: string; component: any; phase: number; status: 'active' | 'planned' }> = {
  strategy: {
    name: '1. Stratégia',
    description: 'Tőke, kockázat, stratégia típus',
    component: StrategyModule,
    phase: 1,
    status: 'active',
  },
  analysis: {
    name: '2. Elemzés',
    description: '10 indikátor + Jev AI szavazás',
    component: AnalysisModule,
    phase: 2,
    status: 'active',
  },
  entry: {
    name: '3. Belépési pont',
    description: 'Ajánlott ár, stop-loss, take-profit',
    component: EntryPointModule,
    phase: 3,
    status: 'active',
  },
};

function App() {
  const [active, setActive] = useState<ModuleId>('strategy');
  const Active = MODULES[active];

  return (
    <div className="min-h-screen flex bg-[var(--color-bg)]">
      <aside className="w-64 border-r border-[var(--color-border)] bg-[var(--color-panel)] p-6 shrink-0">
        <div className="flex items-center gap-2 mb-8">
          <TrendingUp className="text-[var(--color-accent)]" />
          <span className="font-bold text-lg">Trading Analyzer</span>
        </div>
        <nav className="space-y-2">
          {(Object.keys(MODULES) as ModuleId[]).map((id) => {
            const m = MODULES[id];
            const isActive = active === id;
            return (
              <button
                key={id}
                onClick={() => setActive(id)}
                className={`w-full flex items-start gap-3 p-3 rounded-lg transition text-left ${isActive ? 'bg-[var(--color-accent)] text-black' : 'hover:bg-[var(--color-border)]'}`}
              >
                <div className="shrink-0 mt-0.5">
                  <span className={`inline-block w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center ${isActive ? 'bg-black text-[var(--color-accent)]' : 'bg-[var(--color-border)]'}`}>
                    {m.phase}
                  </span>
                </div>
                <div>
                  <div className="font-medium">{m.name.replace(/^\d+\.\s*/, '')}</div>
                  <div className={`text-xs ${isActive ? 'text-black/70' : 'text-[var(--color-muted)]'}`}>{m.description}</div>
                </div>
              </button>
            );
          })}
        </nav>
        <div className="mt-8 p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
          <div className="text-xs text-[var(--color-muted)] mb-1">Fázis</div>
          <div className="text-sm font-medium">3 / 3 — Teljes</div>
          <div className="mt-2 h-1 bg-[var(--color-border)] rounded">
            <div className="h-full w-full bg-[var(--color-accent)] rounded" />
          </div>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-bold mb-1">{Active.name}</h1>
          <p className="text-[var(--color-muted)]">{Active.description}</p>
        </header>
        <Active.component />
      </main>
    </div>
  );
}

export default App;
