import { useState } from 'react';
import { TrendingUp, Settings2, LineChart, Target } from 'lucide-react';
import StrategyModule from './modules/strategy/StrategyModule';

type ModuleId = 'strategy' | 'analysis' | 'entry';

const MODULES: Record<ModuleId, { name: string; icon: any; description: string; component: any; status: 'active' | 'planned' }> = {
  strategy: {
    name: '1. Stratégia',
    icon: Settings2,
    description: 'Tőke, kockázat, stratégia típus',
    component: StrategyModule,
    status: 'active',
  },
  analysis: {
    name: '2. Elemzés',
    icon: LineChart,
    description: '10 indikátor + Jev AI szavazás',
    component: () => <PlaceholderModule name="Elemzés" phase={2} />,
    status: 'planned',
  },
  entry: {
    name: '3. Belépési pont',
    icon: Target,
    description: 'Ajánlott ár, stop-loss, take-profit',
    component: () => <PlaceholderModule name="Belépési pont" phase={3} />,
    status: 'planned',
  },
};

function PlaceholderModule({ name, phase }: { name: string; phase: number }) {
  return (
    <div className="bg-[var(--color-panel)] border border-[var(--color-border)] rounded-xl p-12 text-center">
      <div className="text-6xl mb-4">🚧</div>
      <h2 className="text-2xl font-semibold mb-2">{name} modul</h2>
      <p className="text-[var(--color-muted)]">
        A {phase}. fázisban készül el. Jelezz, ha építhetjük!
      </p>
    </div>
  );
}

function App() {
  const [active, setActive] = useState<ModuleId>('strategy');
  const Active = MODULES[active];

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-[var(--color-border)] bg-[var(--color-panel)] p-6 shrink-0">
        <div className="flex items-center gap-2 mb-8">
          <TrendingUp className="text-[var(--color-accent)]" />
          <span className="font-bold text-lg">Trading Analyzer</span>
        </div>
        <nav className="space-y-2">
          {(Object.keys(MODULES) as ModuleId[]).map((id) => {
            const m = MODULES[id];
            const Icon = m.icon;
            const isActive = active === id;
            const isDisabled = m.status === 'planned';
            return (
              <button
                key={id}
                onClick={() => !isDisabled && setActive(id)}
                disabled={isDisabled}
                className={`
                  w-full flex items-start gap-3 p-3 rounded-lg transition
                  ${isActive ? 'bg-[var(--color-accent)] text-black' : ''}
                  ${!isActive && !isDisabled ? 'hover:bg-[var(--color-border)]' : ''}
                  ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                <Icon className="w-5 h-5 mt-0.5 shrink-0" />
                <div className="text-left">
                  <div className="font-medium">{m.name}</div>
                  <div className={`text-xs ${isActive ? 'text-black/70' : 'text-[var(--color-muted)]'}`}>
                    {m.description}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
        <div className="mt-8 p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
          <div className="text-xs text-[var(--color-muted)] mb-1">Fázis</div>
          <div className="text-sm font-medium">1 / 3 — Alapok</div>
          <div className="mt-2 h-1 bg-[var(--color-border)] rounded">
            <div className="h-full w-1/3 bg-[var(--color-accent)] rounded" />
          </div>
        </div>
      </aside>

      {/* Main content */}
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
