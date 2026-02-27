import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, Flag, RefreshCw, Hand, X } from 'lucide-react';

const DEPARTMENTS = [
  { name: 'publication', color: '#EC4899' },
  { name: 'printmaking', color: '#F59E0B' }
];

type PopupType = 'number' | 'blank' | 'mine' | 'ghost' | 'summary' | 'flag';

interface PopupData {
  id: string;
  type: PopupType;
  title: string;
  body: string;
  footer?: string;
  x: number;
  y: number;
  zIndex: number;
  color?: string;
  fontSize?: string;
  blur?: string;
  stamp?: string;
}

type TileData = {
  row: number;
  col: number;
  isMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  justFlagged: boolean;
  neighborMines: number;
  ghostDept: typeof DEPARTMENTS[0] | null;
  ghostStrength: number;
  glowGreen: boolean;
  inkSpread: boolean;
};

type LogEvent = {
  id: string;
  timestamp: string;
  title: string;
  body: string;
  isUnseenSummary?: boolean;
};

type RunState = {
  NUM_1: boolean;
  NUM_2: boolean;
  NUM_3: boolean;
  NUM_4: boolean;
  MINE_TRIGGERED: boolean;
  FLAG_PLACED: boolean;
  GHOST_FLAG_CLICKED: boolean;
};

const ROWS = 10;
const COLS = 10;
const MINES = 6;

const DraggablePopup: React.FC<{ data: PopupData, bringToFront: (id: string) => void }> = ({ data, bringToFront }) => {
  const [pos, setPos] = useState({ x: data.x, y: data.y });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number, startY: number, initialX: number, initialY: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    bringToFront(data.id);
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: pos.x,
      initialY: pos.y
    };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({
      x: dragRef.current.initialX + dx,
      y: dragRef.current.initialY + dy
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  let containerStyle: React.CSSProperties = {
    left: pos.x,
    top: pos.y,
    zIndex: data.zIndex,
    opacity: data.type === 'blank' ? 0.7 : 0.9,
    filter: data.blur ? `blur(${data.blur})` : 'none',
    borderColor: data.color || '#0f172a',
  };

  let titleStyle: React.CSSProperties = {
    backgroundColor: data.color || '#0f172a',
    color: '#fff',
  };

  let bodyStyle: React.CSSProperties = {
    fontSize: data.fontSize || '12px',
    lineHeight: '1.2',
  };

  return (
    <div 
      className={`fixed w-52 bg-white border-2 flex flex-col ${data.type === 'mine' ? 'animate-shake border-red-600' : ''}`}
      style={containerStyle}
      onMouseDown={handleMouseDown}
    >
      <div 
        className="px-2 py-1 cursor-grab font-bold text-[10px] tracking-wider flex justify-between items-center select-none"
        style={titleStyle}
      >
        <span>{data.title}</span>
      </div>
      <div className="p-2 text-slate-800 whitespace-pre-line relative overflow-hidden" style={bodyStyle}>
        {data.stamp && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-3xl font-bold text-slate-900/15 animate-soft-fade pixel-font">
              {data.stamp}
            </span>
          </div>
        )}
        <span className="relative z-10 font-mono">
          {data.body.split('\n').map((line, i) => {
            if (line.includes('Environmental Rating:')) {
              const parts = line.split('Environmental Rating:');
              return (
                <React.Fragment key={i}>
                  {parts[0]}Environmental Rating: <span className="rating-stamp">{parts[1].trim()}</span><br/>
                </React.Fragment>
              );
            }
            return <React.Fragment key={i}>{line}<br/></React.Fragment>;
          })}
        </span>
        {data.footer && (
          <div className="mt-1 text-[10px] text-slate-500 border-t border-slate-200 pt-1 relative z-10 font-mono">
            {data.footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default function App() {
  const [grid, setGrid] = useState<TileData[][]>([]);
  const [popups, setPopups] = useState<PopupData[]>([]);
  const [zIndexCounter, setZIndexCounter] = useState(10);
  const [time, setTime] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showCompletionBanner, setShowCompletionBanner] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [hasPlacedFlag, setHasPlacedFlag] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  const [networkLog, setNetworkLog] = useState<LogEvent[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const [runState, setRunState] = useState<RunState>({
    NUM_1: false,
    NUM_2: false,
    NUM_3: false,
    NUM_4: false,
    MINE_TRIGGERED: false,
    FLAG_PLACED: false,
    GHOST_FLAG_CLICKED: false
  });

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerActive) {
      interval = setInterval(() => {
        setTime(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive]);

  useEffect(() => {
    if (!hasPlacedFlag || isCompleted) return;
    
    const interval = setInterval(() => {
      setGrid(g => {
        const newGrid = [...g.map(row => [...row])];
        const validTiles = [];
        let ghostCount = 0;
        let pubCount = 0;
        let printCount = 0;
        
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (newGrid[r][c].ghostDept) {
              ghostCount++;
              if (newGrid[r][c].ghostDept?.name === 'publication') pubCount++;
              if (newGrid[r][c].ghostDept?.name === 'printmaking') printCount++;
            }
            if (!newGrid[r][c].isMine && !newGrid[r][c].ghostDept && !newGrid[r][c].isFlagged && !newGrid[r][c].isRevealed) {
              validTiles.push({ r, c });
            }
          }
        }

        if (validTiles.length > 0 && ghostCount < 4) {
          const availableDepts = [];
          if (pubCount < 2) availableDepts.push(DEPARTMENTS[0]);
          if (printCount < 2) availableDepts.push(DEPARTMENTS[1]);

          if (availableDepts.length > 0) {
            const { r, c } = validTiles[Math.floor(Math.random() * validTiles.length)];
            newGrid[r][c].ghostDept = availableDepts[Math.floor(Math.random() * availableDepts.length)];
            newGrid[r][c].ghostStrength = Math.random() > 0.5 ? 0.9 : 0.5;
          }
        }
        return newGrid;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [hasPlacedFlag, isCompleted]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [networkLog]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 200);
  };

  const bringToFront = (id: string) => {
    setZIndexCounter(z => z + 1);
    setPopups(prev => prev.map(p => p.id === id ? { ...p, zIndex: zIndexCounter + 1 } : p));
  };

  const logEvent = useCallback((typeKey: string, title: string, body: string) => {
    setNetworkLog(prevLogs => {
      if (!prevLogs.some(log => log.id === typeKey)) {
        const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        let logTitle = title;
        let logBody = body.split('\n')[0]; // Take first line for terminal brevity
        
        if (typeKey.startsWith('num-')) {
          logTitle = `[VISIBILITY ${typeKey.split('-')[1]}]`;
        } else if (typeKey === 'ghost') {
          logTitle = `[INTERFERENCE]`;
        } else if (typeKey === 'mine') {
          logTitle = `[CARBON EVENT]`;
          logBody = 'Post-use blackout.';
        } else if (typeKey === 'flag') {
          logTitle = `[OFFSET]`;
          logBody = 'Carbon impact compensated.';
        } else if (typeKey === 'blank') {
          logTitle = `[MISSING]`;
          logBody = 'No incident logged.';
        }

        return [...prevLogs, { id: typeKey, timestamp, title: logTitle, body: logBody }];
      }
      return prevLogs;
    });
  }, []);

  const addPopup = useCallback((type: PopupType, extra?: any) => {
    const id = Math.random().toString(36).substr(2, 9);
    const x = Math.max(280, Math.floor(Math.random() * (window.innerWidth - 260)));
    const y = Math.max(20, Math.floor(Math.random() * (window.innerHeight - 200)));
    
    setZIndexCounter(z => z + 1);
    const zIndex = zIndexCounter + 1;

    let popup: PopupData = { id, type, title: '', body: '', x, y, zIndex };

    if (type === 'number') {
      const num = extra.num;
      if (num === 1) {
        popup.title = 'VISIBILITY: 1';
        popup.body = 'Selection data available.\nEnvironmental Rating: A/B/C\nStudents rarely pay attention.';
        popup.fontSize = '16px';
        popup.blur = '0px';
        setRunState(s => ({ ...s, NUM_1: true }));
      } else if (num === 2) {
        popup.title = 'VISIBILITY: 2';
        popup.body = 'Supplier credentials recorded.\nReuse exists but not centralised.\nStudents rarely pay attention.';
        popup.fontSize = '14px';
        popup.blur = '0.5px';
        setRunState(s => ({ ...s, NUM_2: true }));
      } else if (num === 3) {
        popup.title = 'VISIBILITY: 3';
        popup.body = 'Cross-workshop link partial.\nPublication exchange: occasional, informal.';
        popup.fontSize = '12px';
        popup.blur = '1px';
        setRunState(s => ({ ...s, NUM_3: true }));
      } else {
        popup.title = `VISIBILITY: ${num}`;
        popup.body = 'Downstream unknown.\nDisposal handled externally. No trace.';
        popup.fontSize = '11px';
        popup.blur = '1.5px';
        setRunState(s => ({ ...s, NUM_4: true }));
      }
      
      if (num === 1 || num === 2) {
        const grades = ['A', 'B', 'C'];
        const grade = grades[Math.floor(Math.random() * grades.length)];
        popup.stamp = grade;
        if (num === 1) {
           popup.body = `Selection data available.\nEnvironmental Rating: ${grade}\nStudents rarely pay attention.`;
        } else if (num === 2) {
           popup.body = `Supplier credentials recorded.\nEnvironmental Rating: ${grade}\nReuse exists but not centralised.`;
        }
      }
      logEvent(`num-${num}`, popup.title, popup.body);
    } else if (type === 'blank') {
      popup.title = 'MISSING RECORD';
      popup.body = 'No incident logged here.\nAbsence does not equal sustainability.';
      logEvent('blank', popup.title, popup.body);
    } else if (type === 'mine') {
      popup.title = 'POST-USE BLACKOUT';
      popup.body = 'A-rated at selection.\nUntraceable after use.\nRecycling route not recorded.';
      popup.footer = 'Visibility collapses downstream.';
      popup.color = '#dc2626';
      setRunState(s => ({ ...s, MINE_TRIGGERED: true }));
      logEvent('mine', popup.title, popup.body);
    } else if (type === 'ghost') {
      const dept = extra.dept;
      popup.title = 'INTERFERENCE SIGNAL';
      popup.color = dept.color;
      if (dept.name === 'publication') {
        popup.body = `From: Publication\nPaper alignment partially shared.\nReuse discussion recorded.`;
      } else if (dept.name === 'printmaking') {
        popup.body = `From: Printmaking\nSpecification mismatch detected.\nTransfer attempt failed.`;
      }
      setRunState(s => ({ ...s, GHOST_FLAG_CLICKED: true }));
      logEvent('ghost', popup.title, popup.body);
    } else if (type === 'flag') {
      popup.title = 'OFFSET DECLARED';
      popup.body = 'Carbon impact compensated via external programme.\nVerification unavailable.';
      setRunState(s => ({ ...s, FLAG_PLACED: true }));
      logEvent('flag', popup.title, popup.body);
    }

    setPopups(prev => [...prev, popup]);
  }, [zIndexCounter, logEvent]);

  const initializeGrid = useCallback(() => {
    let newGrid: TileData[][] = Array(ROWS).fill(null).map((_, r) =>
      Array(COLS).fill(null).map((_, c) => ({
        row: r,
        col: c,
        isMine: false,
        isRevealed: false,
        isFlagged: false,
        justFlagged: false,
        neighborMines: 0,
        ghostDept: null,
        ghostStrength: 1,
        glowGreen: false,
        inkSpread: false,
      }))
    );

    let minesPlaced = 0;
    while (minesPlaced < MINES) {
      const r = Math.floor(Math.random() * ROWS);
      const c = Math.floor(Math.random() * COLS);
      if (!newGrid[r][c].isMine) {
        newGrid[r][c].isMine = true;
        minesPlaced++;
      }
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!newGrid[r][c].isMine) {
          let count = 0;
          for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
              if (r + i >= 0 && r + i < ROWS && c + j >= 0 && c + j < COLS) {
                if (newGrid[r + i][c + j].isMine) count++;
              }
            }
          }
          newGrid[r][c].neighborMines = count;
        }
      }
    }

    setGrid(newGrid);
    setPopups([]);
    setIsCompleted(false);
    setShowCompletionModal(false);
    setShowCompletionBanner(false);
    setTime(0);
    setTimerActive(false);
    setHasPlacedFlag(false);
    setClickCount(0);
    setNetworkLog([]);
    setRunState({
      NUM_1: false,
      NUM_2: false,
      NUM_3: false,
      NUM_4: false,
      MINE_TRIGGERED: false,
      FLAG_PLACED: false,
      GHOST_FLAG_CLICKED: false
    });
  }, []);

  useEffect(() => {
    initializeGrid();
  }, [initializeGrid]);

  const checkCompletion = (currentGrid: TileData[][]) => {
    let allRevealed = true;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!currentGrid[r][c].isMine && !currentGrid[r][c].isRevealed) {
          allRevealed = false;
          break;
        }
      }
    }
    if (allRevealed && !isCompleted) {
      setIsCompleted(true);
      setTimerActive(false);
      setShowCompletionModal(true);
    }
  };

  const handleModalClose = () => {
    setShowCompletionModal(false);
    setShowCompletionBanner(true);

    const unseenKeys = Object.entries(runState)
      .filter(([_, seen]) => !seen)
      .map(([key]) => key);

    let summaryBody = '';
    if (unseenKeys.length === 0) {
      summaryBody = '> ALL TYPES DISCOVERED ✓';
    } else {
      summaryBody = unseenKeys.map(key => `> ${key} [UNSEEN]`).join('\n');
    }

    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    setNetworkLog(prev => [
      ...prev,
      {
        id: 'unseen-summary',
        timestamp,
        title: '--- UNSEEN TYPES (REPLAY TO DISCOVER) ---',
        body: summaryBody,
        isUnseenSummary: true
      }
    ]);
  };

  const revealTile = (r: number, c: number) => {
    if (grid[r][c].isFlagged) return;
    if (!timerActive && !isCompleted) setTimerActive(true);

    setClickCount(prev => prev + 1);

    const newGrid = [...grid.map(row => [...row])];
    const tile = newGrid[r][c];

    if (tile.ghostDept) {
      addPopup('ghost', { dept: tile.ghostDept, strength: tile.ghostStrength });
    }

    if (tile.isRevealed) return;

    tile.isRevealed = true;

    if (tile.isMine) {
      tile.inkSpread = true;
      triggerShake();
      addPopup('mine');
    } else if (tile.neighborMines === 0) {
      tile.glowGreen = true;
      setTimeout(() => {
        setGrid(g => {
          const next = [...g.map(row => [...row])];
          if (next[r][c]) next[r][c].glowGreen = false;
          return next;
        });
      }, 1000);
      
      if (!tile.ghostDept) addPopup('blank');

      const queue = [[r, c]];
      while (queue.length > 0) {
        const [currR, currC] = queue.shift()!;
        for (let i = -1; i <= 1; i++) {
          for (let j = -1; j <= 1; j++) {
            const nr = currR + i;
            const nc = currC + j;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              const neighbor = newGrid[nr][nc];
              if (!neighbor.isRevealed && !neighbor.isMine && !neighbor.isFlagged) {
                neighbor.isRevealed = true;
                if (neighbor.neighborMines === 0) {
                  queue.push([nr, nc]);
                }
              }
            }
          }
        }
      }
    } else {
      if (!tile.ghostDept) {
        addPopup('number', { num: tile.neighborMines });
      }
    }

    setGrid(newGrid);
    if (!tile.isMine) {
      checkCompletion(newGrid);
    }
  };

  const toggleFlag = (e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    if (grid[r][c].isRevealed) return;
    if (!timerActive && !isCompleted) setTimerActive(true);

    setClickCount(prev => prev + 1);

    const newGrid = [...grid.map(row => [...row])];
    const tile = newGrid[r][c];

    if (!tile.isFlagged) {
      tile.isFlagged = true;
      tile.justFlagged = true;
      setHasPlacedFlag(true);
      addPopup('flag');
      
      setTimeout(() => {
        setGrid(g => {
          const next = [...g.map(row => [...row])];
          if (next[r][c]) next[r][c].justFlagged = false;
          return next;
        });
      }, 1000);
    } else {
      tile.isFlagged = false;
    }

    setGrid(newGrid);
  };

  const getNumberColor = (num: number) => {
    switch (num) {
      case 1: return 'text-blue-500';
      case 2: return 'text-emerald-500';
      case 3: return 'text-amber-500';
      case 4: return 'text-rose-500';
      default: return 'text-rose-600';
    }
  };

  const overlayOpacity = Math.min(clickCount * 0.015, 0.6);

  return (
    <div className={`min-h-screen bg-[#e8ecef] text-slate-800 font-sans flex flex-col lg:flex-row transition-transform ${isShaking ? 'animate-shake' : ''} overflow-hidden relative`}>
      <div 
        className="fixed inset-0 pointer-events-none z-0 transition-opacity duration-500"
        style={{ backgroundColor: `rgba(0,0,0, ${overlayOpacity})` }}
      />

      {/* Network Log Panel - Left Terminal Style */}
      <div className="w-full lg:w-[260px] bg-[#111] border-r-2 border-slate-700 flex flex-col h-[300px] lg:h-screen relative z-20 shrink-0 text-[#209bff] font-mono">
        <div className="p-4 border-b border-slate-800 bg-[#1a1a1a]">
          <h2 className="text-sm font-bold tracking-widest text-[#209bff]">NETWORK LOG</h2>
          <p className="text-[10px] text-[#209bff]/70 mt-2 leading-relaxed">Reveal all tiles to reconstruct network dynamics.</p>
        </div>
        <div ref={logContainerRef} className="flex-1 overflow-y-auto p-4 space-y-2">
          {networkLog.length === 0 && (
            <div className="text-[10px] text-[#209bff]/50 italic animate-pulse">&gt; Awaiting data stream...</div>
          )}
          {networkLog.map(log => (
            <div key={log.id} className={`text-[11px] leading-tight animate-in fade-in slide-in-from-left-2 duration-300 ${log.isUnseenSummary ? 'mt-4 pt-4 border-t border-[#209bff]/30' : ''}`}>
              {!log.isUnseenSummary && <span className="text-[#209bff]/50 mr-2">[{log.timestamp}]</span>}
              <span className={`text-[#209bff] font-bold ${log.isUnseenSummary ? 'block mb-2' : ''}`}>{log.title}</span>
              <span className={`text-[#209bff]/90 ${log.isUnseenSummary ? 'block whitespace-pre-line' : 'ml-2'}`}>{log.body}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex-1 flex flex-col relative z-10 h-screen overflow-y-auto">
        {showCompletionBanner && (
          <div className="w-full bg-slate-900 text-white p-3 text-center border-b-2 border-slate-700 animate-in slide-in-from-top-4 z-30 sticky top-0">
            <h3 className="text-sm font-bold tracking-widest mb-1">SYSTEM VISIBILITY LIMIT REACHED</h3>
            <p className="text-xs font-mono text-slate-400">Front-end guidance visible. Post-use flow unresolved. Circularity incomplete.</p>
            <p className="text-[10px] font-mono text-[#209bff] mt-1">Replay to reveal missing nodes of the network.</p>
          </div>
        )}

        <div className="flex-1 flex justify-center items-start pt-12 px-4 lg:px-8 pb-12">
          <div className="max-w-2xl w-full">
            <header className="mb-8 border-b-2 border-slate-300 pb-4 flex justify-between items-end">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">DIGITAL PRINT NODE</h1>
                <p className="text-sm text-slate-500 font-mono mt-1">SYSTEM COMPLEXITY INDEX // 2050 RECONSTRUCTION</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="bg-slate-900 text-red-500 font-mono text-xl px-3 py-1 rounded border-2 border-slate-700 tracking-widest">
                  {formatTime(time)}
                </div>
                <button 
                  onClick={initializeGrid}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium rounded transition-colors"
                >
                  <RefreshCw size={16} />
                  RESET
                </button>
              </div>
            </header>

            <div className="bg-slate-400 p-4 rounded-sm border border-slate-300 relative">
              <div 
                className="grid gap-[1px] mx-auto relative z-10 bg-slate-400 border-[1px] border-slate-400" 
                style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
                onContextMenu={(e) => e.preventDefault()}
              >
                {grid.map((row, r) => row.map((tile, c) => {
                  
                  let content = null;
                  let cellClass = "aspect-square w-full flex items-center justify-center text-lg font-bold select-none transition-all duration-300 relative overflow-hidden ";
                  
                  if (tile.isRevealed) {
                    if (tile.isMine) {
                      cellClass += "bg-slate-900 text-white ";
                      content = (
                        <>
                          <AlertCircle size={20} className="text-rose-500 relative z-10" />
                          {tile.inkSpread && (
                            <div className="absolute w-full h-full bg-black rounded-full animate-ink pointer-events-none z-0" />
                          )}
                        </>
                      );
                    } else if (tile.neighborMines > 0) {
                      cellClass += "bg-slate-100 ";
                      if (tile.ghostDept) {
                        content = (
                          <div className="relative w-full h-full flex items-center justify-center">
                            <span className={getNumberColor(tile.neighborMines)}>{tile.neighborMines}</span>
                            <Hand size={16} className="absolute bottom-1 right-1" style={{ color: tile.ghostDept.color, opacity: tile.ghostStrength }} />
                          </div>
                        );
                      } else {
                        content = <span className={getNumberColor(tile.neighborMines)}>{tile.neighborMines}</span>;
                      }
                    } else {
                      cellClass += tile.glowGreen ? "bg-emerald-100 " : "bg-slate-100 ";
                      if (tile.ghostDept) {
                        content = <Hand size={18} style={{ color: tile.ghostDept.color, opacity: tile.ghostStrength }} />;
                      }
                    }
                  } else {
                    cellClass += "bg-slate-300 hover:bg-slate-200 cursor-pointer ";
                    if (tile.isFlagged) {
                      cellClass += "!bg-slate-900 ";
                      if (tile.justFlagged) {
                        cellClass += "z-10 ";
                      }
                      content = (
                        <div className="flex flex-col items-center justify-center">
                          <Flag size={16} className="text-emerald-400" />
                          <span className="text-[6px] text-emerald-400 leading-none mt-0.5">OFFSET</span>
                        </div>
                      );
                    } else if (tile.ghostDept) {
                      content = <Hand size={18} style={{ color: tile.ghostDept.color, opacity: tile.ghostStrength }} />;
                    }
                  }

                  return (
                    <div
                      key={`${r}-${c}`}
                      className={cellClass}
                      onClick={() => revealTile(r, c)}
                      onContextMenu={(e) => toggleFlag(e, r, c)}
                    >
                      {content}
                    </div>
                  );
                }))}
              </div>
            </div>

            <div className="mt-8 text-xs text-slate-500 font-mono flex justify-between">
              <span>LEFT CLICK: EXPLORE NODE</span>
              <span>RIGHT CLICK: DECLARE OFFSET</span>
            </div>
          </div>
        </div>
      </div>

      {popups.map(popup => (
        <DraggablePopup key={popup.id} data={popup} bringToFront={bringToFront} />
      ))}

      {showCompletionModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-500">
          <div className="max-w-md w-full p-6 border-2 border-slate-900 bg-white relative">
            <button 
              onClick={handleModalClose}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-900 transition-colors"
            >
              <X size={20} />
            </button>
            <h2 className="text-lg font-bold tracking-widest mb-4 text-slate-900 border-b-2 border-slate-200 pb-2">SYSTEM VISIBILITY LIMIT REACHED</h2>
            <p className="font-mono text-sm leading-relaxed mb-6 text-slate-700">
              Front-end guidance visible.<br/>
              Post-use flow unresolved.<br/>
              Circularity incomplete.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={initializeGrid}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold tracking-wider transition-colors border border-slate-300"
              >
                RESTART
              </button>
              <button 
                onClick={handleModalClose}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold tracking-wider transition-colors"
              >
                ACKNOWLEDGE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
