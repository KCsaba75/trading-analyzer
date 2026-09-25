import { useState } from 'react';
import { TrendingUp, Menu, X } from 'lucide-react';
import StrategyModule from './modules/strategy/StrategyModule';
import AnalysisModule from './modules/analysis/AnalysisModule';
import EntryPointModule from './modules/entry-point/EntryPointModule';
import PositionsModule from './modules/positions/PositionsModule';
import WatchlistModule from './modules/watchlist/WatchlistModule';

type ModuleId = 'strategy' | 'analysis' | 'entry' | 'positions' | 'watchlist';

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
  watchlist: {
    name: '3. Figyelőlista',
    description: 'Tickerek és timeframes kezelése',
    component: WatchlistModule,
    phase: 3,
    status: 'active',
  },
  positions: {
    name: '4. Pozíciók',
    description: 'Aktív pozíciók és várakozó ajánlások',
    component: PositionsModule,
    phase: 4,
    status: 'active',
  },
};

function App() {
  const [active, setActive] = useState<ModuleId>('strategy');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const Active = MODULES[active];

  const handleModuleChange = (id: ModuleId) => {
    setActive(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[var(--color-bg)]">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 border-b border-[var(--color-border)] bg-[var(--color-panel)] sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-[var(--color-accent)]" size={20} />
          <span className="font-bold text-base">Trading Analyzer</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg hover:bg-[var(--color-border)]"
          aria-label="Menü"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Sidebar / Mobile Menu */}
      <aside
        className={`${
          mobileMenuOpen ? 'block' : 'hidden'
        } md:block w-full md:w-64 md:border-r border-[var(--color-border)] bg-[var(--color-panel)] p-4 md:p-6 shrink-0`}
      >
        <div className="hidden md:flex items-center gap-2 mb-8">
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
                onClick={() => handleModuleChange(id)}
                className={`w-full flex items-start gap-3 p-3 rounded-lg transition text-left ${
                  isActive ? 'bg-[var(--color-accent)] text-black' : 'hover:bg-[var(--color-border)]'
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  <span
                    className={`inline-block w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center ${
                      isActive ? 'bg-black text-[var(--color-accent)]' : 'bg-[var(--color-border)]'
                    }`}
                  >
                    {m.phase}
                  </span>
                </div>
                <div>
                  <div className="font-medium text-sm md:text-base">{m.name.replace(/^\d+\.\s*/, '')}</div>
                  <div className={`text-xs ${isActive ? 'text-black/70' : 'text-[var(--color-muted)]'}`}>
                    {m.description}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
        <div className="mt-6 md:mt-8 p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)]">
          <div className="text-xs text-[var(--color-muted)] mb-1">Fázis</div>
          <div className="text-sm font-medium">4 / 4 — Teljes</div>
          <div className="mt-2 h-1 bg-[var(--color-border)] rounded">
            <div className="h-full w-full bg-[var(--color-accent)] rounded" />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-auto pb-20 md:pb-8">
        <header className="mb-4 md:mb-6">
          <h1 className="text-xl md:text-3xl font-bold mb-1">{Active.name}</h1>
          <p className="text-sm md:text-base text-[var(--color-muted)]">{Active.description}</p>
        </header>
        <Active.component />
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--color-panel)] border-t border-[var(--color-border)] flex justify-around z-50">
        {(Object.keys(MODULES) as ModuleId[]).map((id) => {
          const m = MODULES[id];
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => handleModuleChange(id)}
              className={`flex-1 flex flex-col items-center py-2 px-1 ${
                isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'
              }`}
            >
              <span
                className={`inline-block w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center mb-1 ${
                  isActive ? 'bg-[var(--color-accent)] text-black' : 'bg-[var(--color-border)]'
                }`}
              >
                {m.phase}
              </span>
              <span className="text-[10px]">{m.name.replace(/^\d+\.\s*/, '')}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default App;
