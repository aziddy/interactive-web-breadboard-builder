import { useState, useCallback, useRef, useEffect } from "react";

const COLS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
const ROWS = Array.from({ length: 30 }, (_, i) => i + 1);
const POWER_RAILS = ["left+", "left-", "right+", "right-"];

const WIRE_COLORS = [
  { name: "Red", hex: "#e53e3e" },
  { name: "Black", hex: "#1a1a2e" },
  { name: "Yellow", hex: "#ecc94b" },
  { name: "Green", hex: "#38a169" },
  { name: "Blue", hex: "#3182ce" },
  { name: "Orange", hex: "#dd6b20" },
  { name: "White", hex: "#e2e8f0" },
  { name: "Purple", hex: "#805ad5" },
  { name: "Brown", hex: "#8B5E3C" },
  { name: "Gray", hex: "#888" },
];

const ESP32_LEFT_PINS = {
  15: "X", 16: "X", 17: "X", 18: "GPIO8", 19: "GPIO12", 20: "GPIO13",
  21: "GPIO10", 22: "GPIO11", 23: "GPIO14", 24: "GPIO15", 25: "GPIO16",
  26: "GPIO17", 27: "GPIO18", 28: "GPIO20", 29: "5V", 30: "GND",
};
const ESP32_RIGHT_PINS = {
  15: "GND", 16: "GPIO41", 17: "GPIO40", 18: "3.3V", 19: "GPIO39",
  20: "GPIO32", 21: "GND", 22: "GND", 23: "GPIO38", 24: "GPIO36",
  25: "GPIO35", 26: "GPIO34", 27: "X", 28: "X", 29: "X", 30: "X",
};

const CELL_SIZE = 22;
const GAP = 3;
const RAIL_WIDTH = 18;
const GUTTER = 14;
const CENTER_GAP = 28;
const HEADER_H = 30;
const TOP_PAD = 10;
const LEFT_PAD = 12;

function getCellPos(col, row) {
  const colIdx = COLS.indexOf(col);
  if (colIdx === -1) return null;
  const leftBlock = colIdx < 5;
  let x = LEFT_PAD + RAIL_WIDTH + GAP + RAIL_WIDTH + GAP + GUTTER;
  if (leftBlock) {
    x += colIdx * (CELL_SIZE + GAP);
  } else {
    x += 5 * (CELL_SIZE + GAP) + CENTER_GAP + (colIdx - 5) * (CELL_SIZE + GAP);
  }
  const y = HEADER_H + TOP_PAD + (row - 1) * (CELL_SIZE + GAP);
  return { x: x + CELL_SIZE / 2, y: y + CELL_SIZE / 2 };
}

function getRailPos(rail, row) {
  let x;
  const baseLeft = LEFT_PAD;
  const rightStart =
    LEFT_PAD + RAIL_WIDTH + GAP + RAIL_WIDTH + GAP + GUTTER +
    5 * (CELL_SIZE + GAP) + CENTER_GAP + 5 * (CELL_SIZE + GAP) + GUTTER;
  if (rail === "left+") x = baseLeft + RAIL_WIDTH / 2;
  else if (rail === "left-") x = baseLeft + RAIL_WIDTH + GAP + RAIL_WIDTH / 2;
  else if (rail === "right+") x = rightStart + RAIL_WIDTH / 2;
  else x = rightStart + RAIL_WIDTH + GAP + RAIL_WIDTH / 2;
  const y = HEADER_H + TOP_PAD + (row - 1) * (CELL_SIZE + GAP);
  return { x, y: y + CELL_SIZE / 2 };
}

function getPointPos(point) {
  if (point.type === "rail") return getRailPos(point.rail, point.row);
  return getCellPos(point.col, point.row);
}

const BOARD_W =
  LEFT_PAD + RAIL_WIDTH + GAP + RAIL_WIDTH + GAP + GUTTER +
  5 * (CELL_SIZE + GAP) + CENTER_GAP + 5 * (CELL_SIZE + GAP) +
  GUTTER + RAIL_WIDTH + GAP + RAIL_WIDTH + LEFT_PAD;
const BOARD_H = HEADER_H + TOP_PAD + 30 * (CELL_SIZE + GAP) + 10;

function Hole({ x, y, occupied, isEsp, espLabel, isX, onClick, highlight, selected }) {
  const fill = isX
    ? "#555"
    : isEsp
    ? "#2d7d46"
    : occupied
    ? "#ff9800"
    : "var(--hole-color, #1a1a2e)";
  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      <rect
        x={x - CELL_SIZE / 2}
        y={y - CELL_SIZE / 2}
        width={CELL_SIZE}
        height={CELL_SIZE}
        rx={3}
        fill={highlight ? "rgba(255,255,120,0.3)" : "transparent"}
        stroke={selected ? "#ffd700" : highlight ? "#ffd70088" : "transparent"}
        strokeWidth={selected ? 2 : 1}
      />
      <circle cx={x} cy={y} r={4.5} fill={fill} stroke="#0005" strokeWidth={0.5} />
      {isEsp && espLabel && (
        <text
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={5.5}
          fontWeight="bold"
          fill="#fff"
          style={{ pointerEvents: "none" }}
        >
          {espLabel.replace("GPIO", "")}
        </text>
      )}
    </g>
  );
}

function RailHole({ x, y, isPlus, onClick, highlight, selected }) {
  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      <rect
        x={x - RAIL_WIDTH / 2}
        y={y - CELL_SIZE / 2}
        width={RAIL_WIDTH}
        height={CELL_SIZE}
        rx={2}
        fill={highlight ? "rgba(255,255,120,0.2)" : "transparent"}
        stroke={selected ? "#ffd700" : "transparent"}
        strokeWidth={selected ? 2 : 0}
      />
      <circle
        cx={x}
        cy={y}
        r={4}
        fill={isPlus ? "#c53030" : "#2b6cb0"}
        stroke="#0004"
        strokeWidth={0.5}
      />
    </g>
  );
}

function Wire({ from, to, color, onClick, onContextMenu, isHovered }) {
  const p1 = getPointPos(from);
  const p2 = getPointPos(to);
  if (!p1 || !p2) return null;

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const sag = Math.min(dist * 0.18, 30);
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2 - sag;

  const handleCtx = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onContextMenu) onContextMenu(e);
  };

  return (
    <g onClick={onClick} onContextMenu={handleCtx} style={{ cursor: "pointer" }}>
      <path
        d={`M${p1.x},${p1.y} Q${mx},${my} ${p2.x},${p2.y}`}
        stroke={isHovered ? "#fff" : color}
        strokeWidth={isHovered ? 4 : 3}
        fill="none"
        strokeLinecap="round"
        opacity={0.92}
      />
      <path
        d={`M${p1.x},${p1.y} Q${mx},${my} ${p2.x},${p2.y}`}
        stroke="transparent"
        strokeWidth={14}
        fill="none"
      />
      <circle cx={p1.x} cy={p1.y} r={3.5} fill={color} stroke="#0004" strokeWidth={0.5} />
      <circle cx={p2.x} cy={p2.y} r={3.5} fill={color} stroke="#0004" strokeWidth={0.5} />
    </g>
  );
}

function ESP32Outline() {
  const topLeft = getCellPos("b", 15);
  const botRight = getCellPos("i", 30);
  if (!topLeft || !botRight) return null;
  const pad = 4;
  const x = topLeft.x - CELL_SIZE / 2 - pad;
  const y = topLeft.y - CELL_SIZE / 2 - pad - 6;
  const w = botRight.x - topLeft.x + CELL_SIZE + pad * 2;
  const h = botRight.y - topLeft.y + CELL_SIZE + pad * 2 + 6;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={6} fill="#1a472a" stroke="#2d7d46" strokeWidth={1.5} opacity={0.85} />
      <rect x={x + w / 2 - 22} y={y + h - 14} width={44} height={16} rx={3} fill="#444" stroke="#666" strokeWidth={0.5} />
      <text x={x + w / 2} y={y + h - 3} textAnchor="middle" fontSize={5} fill="#aaa" fontFamily="monospace">USB-C</text>
      <text x={x + w / 2} y={y + h / 2 - 4} textAnchor="middle" fontSize={7} fill="#4ade80" fontWeight="bold" fontFamily="monospace">
        ESP32 LOLIN32
      </text>
      <text x={x + w / 2} y={y + h / 2 + 5} textAnchor="middle" fontSize={5} fill="#4ade8088" fontFamily="monospace">
        V1.0.0
      </text>
    </g>
  );
}

export default function BreadboardApp() {
  const [wires, setWires] = useState([]);
  const [selectedColor, setSelectedColor] = useState(WIRE_COLORS[0].hex);
  const [wireStart, setWireStart] = useState(null);
  const [hoveredWire, setHoveredWire] = useState(null);
  const [tool, setTool] = useState("wire");
  const [labels, setLabels] = useState({});
  const [labelInput, setLabelInput] = useState("");
  const [labelTarget, setLabelTarget] = useState(null);
  const [history, setHistory] = useState([]);
  const [showPinRef, setShowPinRef] = useState(false);
  const [ctxMenu, setCtxMenu] = useState(null); // { wireId, x, y }
  const svgRef = useRef(null);

  const pushHistory = useCallback(() => {
    setHistory((h) => [...h.slice(-30), JSON.stringify(wires)]);
  }, [wires]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setWires(JSON.parse(prev));
  }, [history]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        undo();
      }
      if (e.key === "Escape") {
        setWireStart(null);
        setLabelTarget(null);
        setCtxMenu(null);
      }
    };
    const clickAway = () => setCtxMenu(null);
    window.addEventListener("keydown", handler);
    window.addEventListener("click", clickAway);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("click", clickAway);
    };
  }, [undo]);

  const pointKey = (p) =>
    p.type === "rail" ? `${p.rail}:${p.row}` : `${p.col}${p.row}`;

  const handleCellClick = (point) => {
    if (tool === "label") {
      setLabelTarget(point);
      setLabelInput(labels[pointKey(point)] || "");
      return;
    }
    if (tool === "eraser") {
      pushHistory();
      setWires((w) =>
        w.filter(
          (wire) =>
            pointKey(wire.from) !== pointKey(point) &&
            pointKey(wire.to) !== pointKey(point)
        )
      );
      const k = pointKey(point);
      if (labels[k]) {
        setLabels((l) => {
          const copy = { ...l };
          delete copy[k];
          return copy;
        });
      }
      return;
    }
    if (!wireStart) {
      setWireStart(point);
    } else {
      if (pointKey(wireStart) !== pointKey(point)) {
        pushHistory();
        setWires((w) => [
          ...w,
          { from: wireStart, to: point, color: selectedColor, id: Date.now() },
        ]);
      }
      setWireStart(null);
    }
  };

  const saveLabel = () => {
    if (labelTarget) {
      const k = pointKey(labelTarget);
      setLabels((l) =>
        labelInput.trim() ? { ...l, [k]: labelInput.trim() } : (() => { const c = { ...l }; delete c[k]; return c; })()
      );
      setLabelTarget(null);
      setLabelInput("");
    }
  };

  const deleteWire = (id) => {
    pushHistory();
    setWires((w) => w.filter((wire) => wire.id !== id));
  };

  const changeWireColor = (id, newColor) => {
    pushHistory();
    setWires((w) => w.map((wire) => wire.id === id ? { ...wire, color: newColor } : wire));
  };

  const openWireCtxMenu = (e, wireId) => {
    const rect = e.currentTarget.closest('div')?.getBoundingClientRect() || { left: 0, top: 0 };
    setCtxMenu({ wireId, x: e.clientX, y: e.clientY });
  };

  const clearAll = () => {
    if (wires.length === 0 && Object.keys(labels).length === 0) return;
    pushHistory();
    setWires([]);
    setLabels({});
  };

  const occupiedPoints = new Set();
  wires.forEach((w) => {
    occupiedPoints.add(pointKey(w.from));
    occupiedPoints.add(pointKey(w.to));
  });

  const espRows = ROWS.filter((r) => r >= 15 && r <= 30);

  const renderMainGrid = () => {
    const elements = [];
    ROWS.forEach((row) => {
      COLS.forEach((col) => {
        const pos = getCellPos(col, row);
        if (!pos) return;
        const isEspLeft = col === "b" && row >= 15 && row <= 30;
        const isEspRight = col === "i" && row >= 15 && row <= 30;
        const isEsp = isEspLeft || isEspRight;
        const espLabel = isEspLeft ? ESP32_LEFT_PINS[row] : isEspRight ? ESP32_RIGHT_PINS[row] : null;
        const isX = espLabel === "X";
        const isEspBody =
          row >= 15 && row <= 30 && ["c", "d", "e", "f", "g", "h"].includes(col);
        if (isEspBody) return;

        const k = `${col}${row}`;
        const isOccupied = occupiedPoints.has(k);
        const isSelected = wireStart && pointKey(wireStart) === k;
        const isHighlight =
          wireStart &&
          wireStart.type !== "rail" &&
          wireStart.row === row &&
          ((COLS.indexOf(wireStart.col) < 5 && COLS.indexOf(col) < 5) ||
            (COLS.indexOf(wireStart.col) >= 5 && COLS.indexOf(col) >= 5));

        elements.push(
          <Hole
            key={k}
            x={pos.x}
            y={pos.y}
            occupied={isOccupied}
            isEsp={isEsp}
            espLabel={espLabel}
            isX={isX}
            onClick={() =>
              !isX &&
              !isEspBody &&
              handleCellClick({ type: "cell", col, row })
            }
            highlight={isHighlight}
            selected={isSelected}
          />
        );
      });
    });
    return elements;
  };

  const renderRails = () => {
    const elements = [];
    ROWS.forEach((row) => {
      POWER_RAILS.forEach((rail) => {
        const pos = getRailPos(rail, row);
        const isPlus = rail.includes("+");
        const k = `${rail}:${row}`;
        const isSelected = wireStart && pointKey(wireStart) === k;
        const isHighlight =
          wireStart && wireStart.type === "rail" && wireStart.rail === rail;

        elements.push(
          <RailHole
            key={k}
            x={pos.x}
            y={pos.y}
            isPlus={isPlus}
            onClick={() =>
              handleCellClick({ type: "rail", rail, row })
            }
            highlight={isHighlight}
            selected={isSelected}
          />
        );
      });
    });
    return elements;
  };

  const renderLabels = () =>
    Object.entries(labels).map(([key, text]) => {
      let pos;
      if (key.includes(":")) {
        const [rail, row] = key.split(":");
        pos = getRailPos(rail, parseInt(row));
      } else {
        const col = key[0];
        const row = parseInt(key.slice(1));
        pos = getCellPos(col, row);
      }
      if (!pos) return null;
      return (
        <g key={`label-${key}`}>
          <rect
            x={pos.x - 1}
            y={pos.y - 15}
            width={text.length * 5 + 6}
            height={11}
            rx={2}
            fill="#ffd700cc"
          />
          <text
            x={pos.x + 2}
            y={pos.y - 8}
            fontSize={7}
            fill="#1a1a2e"
            fontFamily="monospace"
            fontWeight="bold"
          >
            {text}
          </text>
        </g>
      );
    });

  const renderRowNumbers = () => {
    const leftX = LEFT_PAD + RAIL_WIDTH + GAP + RAIL_WIDTH + GAP + GUTTER / 2 - 2;
    const rightX =
      LEFT_PAD + RAIL_WIDTH + GAP + RAIL_WIDTH + GAP + GUTTER +
      5 * (CELL_SIZE + GAP) + CENTER_GAP + 5 * (CELL_SIZE + GAP) + GUTTER / 2 + 2;
    return ROWS.map((row) => {
      const y = HEADER_H + TOP_PAD + (row - 1) * (CELL_SIZE + GAP) + CELL_SIZE / 2;
      return (
        <g key={`rn-${row}`}>
          <text x={leftX} y={y} textAnchor="middle" dominantBaseline="central" fontSize={7} fill="#888" fontFamily="monospace">
            {row}
          </text>
          <text x={rightX} y={y} textAnchor="middle" dominantBaseline="central" fontSize={7} fill="#888" fontFamily="monospace">
            {row}
          </text>
        </g>
      );
    });
  };

  const renderColHeaders = () => {
    return COLS.map((col) => {
      const pos = getCellPos(col, 1);
      if (!pos) return null;
      return (
        <text
          key={`ch-${col}`}
          x={pos.x}
          y={HEADER_H - 6}
          textAnchor="middle"
          fontSize={9}
          fill="#aaa"
          fontWeight="bold"
          fontFamily="monospace"
        >
          {col}
        </text>
      );
    });
  };

  const renderRailLabels = () => {
    const rails = [
      { rail: "left+", label: "+" },
      { rail: "left-", label: "−" },
      { rail: "right+", label: "+" },
      { rail: "right-", label: "−" },
    ];
    return rails.map(({ rail, label }) => {
      const pos = getRailPos(rail, 1);
      return (
        <text
          key={`rl-${rail}`}
          x={pos.x}
          y={HEADER_H - 6}
          textAnchor="middle"
          fontSize={11}
          fill={label === "+" ? "#e53e3e" : "#3182ce"}
          fontWeight="bold"
          fontFamily="monospace"
        >
          {label}
        </text>
      );
    });
  };

  const pinRefData = espRows.map((r) => ({
    row: r,
    left: ESP32_LEFT_PINS[r],
    right: ESP32_RIGHT_PINS[r],
  }));

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0f0f17",
      color: "#e0e0e0",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      display: "flex",
      flexDirection: "column",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #1a1a2e; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        .tool-btn {
          padding: 6px 14px; border-radius: 6px; border: 1px solid #333;
          background: #1a1a2e; color: #ccc; cursor: pointer; font-size: 12px;
          font-family: inherit; transition: all 0.15s;
        }
        .tool-btn:hover { border-color: #555; background: #252540; }
        .tool-btn.active { border-color: #4ade80; color: #4ade80; background: #1a2e1a; }
        .color-dot {
          width: 24px; height: 24px; border-radius: 50%; cursor: pointer;
          border: 2px solid transparent; transition: all 0.15s; flex-shrink: 0;
        }
        .color-dot:hover { transform: scale(1.15); }
        .color-dot.active { border-color: #fff; box-shadow: 0 0 8px #fff4; }
        .wire-list-item {
          display: flex; align-items: center; gap: 8px; padding: 4px 8px;
          border-radius: 4px; font-size: 11px; cursor: pointer;
          transition: background 0.1s;
        }
        .wire-list-item:hover { background: #ffffff10; }
        .del-btn {
          background: none; border: none; color: #e53e3e; cursor: pointer;
          font-size: 14px; padding: 0 4px; opacity: 0.6; transition: opacity 0.1s;
        }
        .del-btn:hover { opacity: 1; }
        .panel { background: #13131f; border: 1px solid #222; border-radius: 8px; padding: 12px; }
        .modal-overlay {
          position: fixed; inset: 0; background: #000a; z-index: 100;
          display: flex; align-items: center; justify-content: center;
        }
        .modal { background: #1a1a2e; border: 1px solid #333; border-radius: 12px; padding: 20px; max-width: 420px; width: 90%; }
        .modal input {
          width: 100%; padding: 8px 12px; background: #0f0f17; border: 1px solid #444;
          border-radius: 6px; color: #fff; font-family: inherit; font-size: 13px;
          outline: none;
        }
        .modal input:focus { border-color: #4ade80; }
      `}</style>

      {/* Header */}
      <div style={{
        padding: "12px 20px",
        borderBottom: "1px solid #222",
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
        background: "#13131f",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%",
            background: wireStart ? "#ffd700" : "#4ade80",
            boxShadow: wireStart ? "0 0 8px #ffd700" : "0 0 6px #4ade80",
          }} />
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: 1 }}>
            BREADBOARD
          </span>
          <span style={{ fontSize: 10, color: "#666", marginLeft: 4 }}>ESP32 LOLIN32</span>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button className={`tool-btn ${tool === "wire" ? "active" : ""}`} onClick={() => { setTool("wire"); setWireStart(null); }}>
            ⚡ Wire
          </button>
          <button className={`tool-btn ${tool === "label" ? "active" : ""}`} onClick={() => { setTool("label"); setWireStart(null); }}>
            🏷 Label
          </button>
          <button className={`tool-btn ${tool === "eraser" ? "active" : ""}`} onClick={() => { setTool("eraser"); setWireStart(null); }}>
            🗑 Eraser
          </button>
        </div>

        {tool === "wire" && (
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {WIRE_COLORS.map((c) => (
              <div
                key={c.hex}
                className={`color-dot ${selectedColor === c.hex ? "active" : ""}`}
                style={{ background: c.hex }}
                onClick={() => setSelectedColor(c.hex)}
                title={c.name}
              />
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          <button className="tool-btn" onClick={undo} disabled={history.length === 0} style={{ opacity: history.length ? 1 : 0.4 }}>
            ↩ Undo
          </button>
          <button className="tool-btn" onClick={clearAll}>Clear All</button>
          <button className="tool-btn" onClick={() => setShowPinRef(!showPinRef)}>
            {showPinRef ? "Hide" : "📌"} Pin Ref
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        padding: "6px 20px",
        fontSize: 11,
        color: "#666",
        borderBottom: "1px solid #1a1a2e",
        display: "flex",
        gap: 16,
      }}>
        <span>{wires.length} wire{wires.length !== 1 ? "s" : ""}</span>
        <span>{Object.keys(labels).length} label{Object.keys(labels).length !== 1 ? "s" : ""}</span>
        {wireStart && (
          <span style={{ color: "#ffd700" }}>
            Click a second point to complete wire from {pointKey(wireStart)} (Esc to cancel)
          </span>
        )}
        {tool === "eraser" && <span style={{ color: "#e53e3e" }}>Click a hole to remove all wires/labels at that point</span>}
        {tool === "label" && <span style={{ color: "#805ad5" }}>Click any hole to add a label</span>}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Main board area */}
        <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
            width={BOARD_W * 1.5}
            height={BOARD_H * 1.5}
            style={{ display: "block" }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {/* Board background */}
            <rect x={0} y={0} width={BOARD_W} height={BOARD_H} rx={8} fill="#e8e0d0" />
            {/* Inner board color */}
            <rect x={3} y={3} width={BOARD_W - 6} height={BOARD_H - 6} rx={6} fill="#d4cbb8" />

            {/* Center channel */}
            {(() => {
              const leftEdge = getCellPos("e", 1);
              const rightEdge = getCellPos("f", 1);
              if (!leftEdge || !rightEdge) return null;
              const cx = (leftEdge.x + rightEdge.x) / 2;
              return (
                <rect
                  x={cx - CENTER_GAP / 2}
                  y={HEADER_H}
                  width={CENTER_GAP}
                  height={BOARD_H - HEADER_H - 6}
                  fill="#c4b99e"
                  rx={2}
                />
              );
            })()}

            {renderRailLabels()}
            {renderColHeaders()}
            {renderRowNumbers()}
            {renderRails()}
            {renderMainGrid()}
            <ESP32Outline />

            {/* Wires */}
            {wires.map((w) => (
              <Wire
                key={w.id}
                from={w.from}
                to={w.to}
                color={w.color}
                isHovered={hoveredWire === w.id || (ctxMenu && ctxMenu.wireId === w.id)}
                onClick={() => {
                  if (tool === "eraser") deleteWire(w.id);
                }}
                onContextMenu={(e) => {
                  setCtxMenu({ wireId: w.id, x: e.clientX, y: e.clientY });
                }}
              />
            ))}

            {/* Wire-in-progress indicator */}
            {wireStart && (() => {
              const pos = getPointPos(wireStart);
              if (!pos) return null;
              return (
                <circle cx={pos.x} cy={pos.y} r={7} fill="none" stroke="#ffd700" strokeWidth={2} strokeDasharray="3,2">
                  <animate attributeName="r" values="7;10;7" dur="1s" repeatCount="indefinite" />
                </circle>
              );
            })()}

            {renderLabels()}
          </svg>
        </div>

        {/* Sidebar */}
        <div style={{
          width: 260,
          borderLeft: "1px solid #222",
          background: "#0f0f17",
          overflow: "auto",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          flexShrink: 0,
        }}>
          {/* Wire list */}
          <div className="panel">
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, color: "#888", letterSpacing: 1 }}>
              WIRES
            </div>
            {wires.length === 0 && (
              <div style={{ fontSize: 11, color: "#555", padding: "8px 0" }}>
                No wires yet. Select the Wire tool and click two points to connect them.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {wires.map((w) => (
                <div
                  key={w.id}
                  className="wire-list-item"
                  onMouseEnter={() => setHoveredWire(w.id)}
                  onMouseLeave={() => setHoveredWire(null)}
                >
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: w.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontFamily: "monospace", fontSize: 10 }}>
                    {pointKey(w.from)} → {pointKey(w.to)}
                  </span>
                  <button className="del-btn" onClick={() => deleteWire(w.id)} title="Delete wire">×</button>
                </div>
              ))}
            </div>
          </div>

          {/* Pin reference */}
          {showPinRef && (
            <div className="panel">
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, color: "#888", letterSpacing: 1 }}>
                ESP32 PIN MAP
              </div>
              <div style={{ fontSize: 9, fontFamily: "monospace", lineHeight: 1.8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "auto 30px auto", gap: "0 8px", alignItems: "center" }}>
                  <div style={{ fontWeight: 700, color: "#666", borderBottom: "1px solid #222", paddingBottom: 2 }}>Left (b)</div>
                  <div style={{ fontWeight: 700, color: "#666", borderBottom: "1px solid #222", paddingBottom: 2, textAlign: "center" }}>Row</div>
                  <div style={{ fontWeight: 700, color: "#666", borderBottom: "1px solid #222", paddingBottom: 2, textAlign: "right" }}>Right (i)</div>
                  {pinRefData.map(({ row, left, right }) => {
                    const lColor = left === "X" ? "#555" : left === "GND" ? "#3182ce" : left === "5V" ? "#e53e3e" : "#4ade80";
                    const rColor = right === "X" ? "#555" : right === "GND" ? "#3182ce" : right === "3.3V" ? "#dd6b20" : "#4ade80";
                    return [
                      <div key={`l${row}`} style={{ color: lColor }}>{left}</div>,
                      <div key={`r${row}c`} style={{ textAlign: "center", color: "#444" }}>{row}</div>,
                      <div key={`r${row}`} style={{ textAlign: "right", color: rColor }}>{right}</div>,
                    ];
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="panel" style={{ fontSize: 10, color: "#555", lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: "#666" }}>CONTROLS</div>
            <div>Wire: click start hole, click end hole</div>
            <div>Label: click any hole to annotate</div>
            <div>Eraser: click hole or wire to remove</div>
            <div>Right-click a wire to recolor or delete</div>
            <div>Ctrl/Cmd+Z to undo</div>
            <div>Esc to cancel current action</div>
          </div>
        </div>
      </div>

      {/* Label modal */}
      {labelTarget && (
        <div className="modal-overlay" onClick={() => setLabelTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: "#aaa" }}>
              Label for {pointKey(labelTarget)}
            </div>
            <input
              autoFocus
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveLabel()}
              placeholder="Enter label text..."
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="tool-btn" style={{ flex: 1 }} onClick={saveLabel}>Save</button>
              <button className="tool-btn" onClick={() => setLabelTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Wire right-click context menu */}
      {ctxMenu && (() => {
        const wire = wires.find((w) => w.id === ctxMenu.wireId);
        if (!wire) return null;
        return (
          <div
            className="ctx-menu"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              left: ctxMenu.x,
              top: ctxMenu.y,
              zIndex: 200,
              background: "#1e1e30",
              border: "1px solid #444",
              borderRadius: 10,
              padding: "10px 12px",
              boxShadow: "0 8px 30px #000a",
              minWidth: 170,
            }}
          >
            <div style={{ fontSize: 10, color: "#666", fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
              {pointKey(wire.from)} → {pointKey(wire.to)}
            </div>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>Change color</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
              {WIRE_COLORS.map((c) => (
                <div
                  key={c.hex}
                  onClick={() => {
                    changeWireColor(ctxMenu.wireId, c.hex);
                    setCtxMenu(null);
                  }}
                  title={c.name}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: c.hex,
                    cursor: "pointer",
                    border: wire.color === c.hex ? "2px solid #fff" : "2px solid transparent",
                    transition: "transform 0.1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                />
              ))}
            </div>
            <div style={{ borderTop: "1px solid #333", paddingTop: 8 }}>
              <button
                onClick={() => {
                  deleteWire(ctxMenu.wireId);
                  setCtxMenu(null);
                }}
                style={{
                  width: "100%",
                  padding: "6px 0",
                  background: "transparent",
                  border: "1px solid #e53e3e44",
                  borderRadius: 6,
                  color: "#e53e3e",
                  cursor: "pointer",
                  fontSize: 11,
                  fontFamily: "inherit",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#e53e3e18")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                Delete Wire
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
