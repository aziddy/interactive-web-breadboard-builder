import { useState, useCallback, useRef, useEffect, useMemo } from "react";

const COLS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
const ROWS = Array.from({ length: 30 }, (_, i) => i + 1);
const POWER_RAILS = ["left+", "left-", "right+", "right-"];
const LEFT_BUS = ["a", "b", "c", "d", "e"];
const RIGHT_BUS = ["f", "g", "h", "i", "j"];

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
  15: "X", 16: "X", 17: "X", 18: "GPIO39", 19: "GPIO32", 20: "GPIO33",
  21: "GPIO34", 22: "GPIO35", 23: "GPIO25", 24: "GPIO26", 25: "GPIO27",
  26: "GPIO14", 27: "GPIO12", 28: "GPIO13", 29: "5V", 30: "GND",
};
const ESP32_RIGHT_PINS = {
  15: "GND", 16: "GPIO41", 17: "GPIO40", 18: "3.3V", 19: "GPIO39",
  20: "GPIO32", 21: "GND", 22: "GND", 23: "GPIO38", 24: "GPIO36",
  25: "GPIO35", 26: "GPIO34", 27: "X", 28: "X", 29: "X", 30: "X",
};

const GPIO_CAPS = {
  GPIO0: "ADC2_1, CLK1, Touch1",
  GPIO1: "TXD0, CLK3",
  GPIO2: "ADC2_2, HSPI_WP0, Touch2",
  GPIO3: "RXD0, CLK2",
  GPIO4: "ADC2_0, HSPI_HD, Touch0",
  GPIO5: "V_SPI_CS0, SS",
  GPIO8: "GPIO8",
  GPIO10: "GPIO10",
  GPIO11: "GPIO11",
  GPIO12: "ADC2_5, HSPI_Q, Touch5",
  GPIO13: "ADC2_4, HSPI_ID, Touch4",
  GPIO14: "ADC2_6, HSPI_CLK, Touch6",
  GPIO15: "ADC2_3, HSPI_CS0, Touch3",
  GPIO16: "RXD2",
  GPIO17: "TXD2",
  GPIO18: "V_SPI_CLK, SCK",
  GPIO19: "V_SPI_Q, MISO",
  GPIO20: "GPIO20",
  GPIO21: "VSPI_HD, SDA",
  GPIO22: "V_SPI_WP, SCL",
  GPIO23: "V_SPI_D, MOSI",
  GPIO25: "DAC1, ADC2_8",
  GPIO26: "DAC2, ADC2_9",
  GPIO27: "ADC2_7, Touch7",
  GPIO32: "ADC1_4, Touch9, Xtal32P",
  GPIO33: "ADC1_5, Touch8, Xtal32N",
  GPIO34: "ADC1_6 (input only)",
  GPIO35: "ADC1_7 (input only)",
  GPIO36: "ADC1_0, SensVP (input only)",
  GPIO38: "GPIO38",
  GPIO39: "ADC1_3, SensVN (input only)",
  GPIO40: "GPIO40",
  GPIO41: "GPIO41",
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
  if (leftBlock) x += colIdx * (CELL_SIZE + GAP);
  else x += 5 * (CELL_SIZE + GAP) + CENTER_GAP + (colIdx - 5) * (CELL_SIZE + GAP);
  const y = HEADER_H + TOP_PAD + (row - 1) * (CELL_SIZE + GAP);
  return { x: x + CELL_SIZE / 2, y: y + CELL_SIZE / 2 };
}

function getRailPos(rail, row) {
  let x;
  const baseLeft = LEFT_PAD;
  const rightStart = LEFT_PAD + RAIL_WIDTH + GAP + RAIL_WIDTH + GAP + GUTTER + 5 * (CELL_SIZE + GAP) + CENTER_GAP + 5 * (CELL_SIZE + GAP) + GUTTER;
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

const BOARD_W = LEFT_PAD + RAIL_WIDTH + GAP + RAIL_WIDTH + GAP + GUTTER + 5 * (CELL_SIZE + GAP) + CENTER_GAP + 5 * (CELL_SIZE + GAP) + GUTTER + RAIL_WIDTH + GAP + RAIL_WIDTH + LEFT_PAD;
const BOARD_H = HEADER_H + TOP_PAD + 30 * (CELL_SIZE + GAP) + 10;

// ── Union-Find ──
class UnionFind {
  constructor() { this.parent = {}; this.rank = {}; }
  find(x) {
    if (!(x in this.parent)) { this.parent[x] = x; this.rank[x] = 0; }
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(a, b) {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return;
    if (this.rank[ra] < this.rank[rb]) this.parent[ra] = rb;
    else if (this.rank[ra] > this.rank[rb]) this.parent[rb] = ra;
    else { this.parent[rb] = ra; this.rank[ra]++; }
  }
  connected(a, b) { return this.find(a) === this.find(b); }
}

function analyzeNets(wires, labels) {
  const uf = new UnionFind();
  const pk = (p) => p.type === "rail" ? `${p.rail}:${p.row}` : `${p.col}${p.row}`;

  // Implicit breadboard buses
  for (const row of ROWS) {
    for (let i = 1; i < LEFT_BUS.length; i++) uf.union(`${LEFT_BUS[0]}${row}`, `${LEFT_BUS[i]}${row}`);
    for (let i = 1; i < RIGHT_BUS.length; i++) uf.union(`${RIGHT_BUS[0]}${row}`, `${RIGHT_BUS[i]}${row}`);
  }
  // Power rails continuous
  for (const rail of POWER_RAILS) {
    for (let r = 2; r <= 30; r++) uf.union(`${rail}:1`, `${rail}:${r}`);
  }
  // Wires
  for (const w of wires) uf.union(pk(w.from), pk(w.to));

  // ESP32 pin locations
  const espPinKeys = {};
  const addEsp = (col, row, pinLabel) => {
    if (pinLabel === "X") return;
    if (!espPinKeys[pinLabel]) espPinKeys[pinLabel] = [];
    espPinKeys[pinLabel].push(`${col}${row}`);
  };
  for (const r in ESP32_LEFT_PINS) addEsp("b", parseInt(r), ESP32_LEFT_PINS[r]);
  for (const r in ESP32_RIGHT_PINS) addEsp("i", parseInt(r), ESP32_RIGHT_PINS[r]);

  // Merge duplicate ESP32 pins (e.g. multiple GND)
  for (const pin in espPinKeys) {
    const keys = espPinKeys[pin];
    for (let i = 1; i < keys.length; i++) uf.union(keys[0], keys[i]);
  }

  // Collect all relevant points
  const allPoints = new Set();
  for (const w of wires) { allPoints.add(pk(w.from)); allPoints.add(pk(w.to)); }
  for (const pin in espPinKeys) for (const k of espPinKeys[pin]) allPoints.add(k);
  for (const k of Object.keys(labels)) allPoints.add(k);

  // Group into nets
  const netMap = {};
  for (const pt of allPoints) {
    const root = uf.find(pt);
    if (!netMap[root]) netMap[root] = new Set();
    netMap[root].add(pt);
  }

  const isEspHole = (pt) => {
    if (pt.includes(":")) return false;
    const col = pt[0], row = parseInt(pt.slice(1));
    if (col === "b" && ESP32_LEFT_PINS[row] && ESP32_LEFT_PINS[row] !== "X") return true;
    if (col === "i" && ESP32_RIGHT_PINS[row] && ESP32_RIGHT_PINS[row] !== "X") return true;
    return false;
  };

  const result = [];
  for (const root in netMap) {
    const points = netMap[root];
    const netEspPins = new Set();
    const netLabels = [];
    const netRails = [];
    const netExtCells = [];

    for (const pt of points) {
      for (const pin in espPinKeys) {
        for (const k of espPinKeys[pin]) {
          if (uf.connected(k, pt) && !netEspPins.has(pin)) netEspPins.add(pin);
        }
      }
      if (labels[pt]) netLabels.push({ point: pt, label: labels[pt] });
      if (pt.includes(":")) netRails.push(pt);
      else if (!isEspHole(pt)) netExtCells.push(pt);
    }

    if (netEspPins.size > 0 || netLabels.length > 0 || netRails.length > 0 || netExtCells.length > 0) {
      result.push({
        id: root,
        espPins: [...netEspPins].sort(),
        labels: netLabels,
        rails: netRails,
        cells: netExtCells,
        allPoints: [...points],
      });
    }
  }

  result.sort((a, b) => {
    if (a.espPins.length && !b.espPins.length) return -1;
    if (!a.espPins.length && b.espPins.length) return 1;
    return (a.espPins[0] || "").localeCompare(b.espPins[0] || "");
  });

  return { nets: result, espPinKeys, uf };
}

function generateMarkdown(wires, labels) {
  const { nets } = analyzeNets(wires, labels);
  const colorName = (hex) => WIRE_COLORS.find((c) => c.hex === hex)?.name || hex;
  const pk = (p) => p.type === "rail" ? `${p.rail}:${p.row}` : `${p.col}${p.row}`;
  const now = new Date().toISOString().split("T")[0];

  let md = `# ESP32 LOLIN32 V1.0.0 Breadboard Wiring\n\n`;
  md += `> Auto-generated on ${now}\n`;
  md += `> Feed this file to an LLM/AI to generate firmware with the correct pin assignments\n\n`;

  md += `## Board Overview\n\n`;
  md += `- **MCU**: ESP32 WeMos LOLIN32 V1.0.0\n`;
  md += `- **Total jumper wires**: ${wires.length}\n`;
  md += `- **Labeled points**: ${Object.keys(labels).length}\n`;
  md += `- **Identified nets**: ${nets.length}\n\n`;

  const espNets = nets.filter((n) => n.espPins.length > 0);
  if (espNets.length > 0) {
    md += `## ESP32 Pin Assignments\n\n`;
    md += `| Pin | GPIO # | Capabilities | Connects To | Label |\n`;
    md += `|-----|--------|-------------|-------------|-------|\n`;
    const seenPins = new Set();
    for (const net of espNets) {
      for (const pin of net.espPins) {
        if (seenPins.has(pin)) continue;
        seenPins.add(pin);
        const gpioNum = pin.replace("GPIO", "");
        const caps = GPIO_CAPS[pin] || pin;
        const connectedLabels = net.labels.map((l) => l.label).join(", ") || "-";
        const railConns = net.rails.map((r) => r.includes("+") ? "Power rail (+)" : "Power rail (-)");
        const otherPins = net.espPins.filter((p) => p !== pin);
        const connections = [...railConns, ...(otherPins.length ? [`ESP32 ${otherPins.join(", ")}`] : []), ...net.cells];
        md += `| ${pin} | ${gpioNum} | ${caps} | ${connections.join(", ") || "-"} | ${connectedLabels} |\n`;
      }
    }
    md += `\n`;
  }

  if (wires.length > 0) {
    md += `## Wire Connections\n\n`;
    md += `| # | From | To | Color | From Label | To Label |\n`;
    md += `|---|------|----|-------|------------|----------|\n`;
    wires.forEach((w, i) => {
      const fk = pk(w.from), tk = pk(w.to);
      md += `| ${i + 1} | ${fk} | ${tk} | ${colorName(w.color)} | ${labels[fk] || "-"} | ${labels[tk] || "-"} |\n`;
    });
    md += `\n`;
  }

  if (nets.length > 0) {
    md += `## Net Summary (Electrical Connections)\n\n`;
    md += `Each net represents a group of electrically connected points.\n\n`;
    for (let i = 0; i < nets.length; i++) {
      const net = nets[i];
      const name = net.labels.length > 0 ? net.labels[0].label : net.espPins.length > 0 ? net.espPins.join("/") : `NET_${i + 1}`;
      md += `### ${name}\n\n`;
      if (net.espPins.length) md += `- **ESP32 Pins**: ${net.espPins.join(", ")}\n`;
      if (net.rails.length) md += `- **Power Rails**: ${net.rails.map((r) => r.replace(":", " row ")).join(", ")}\n`;
      if (net.labels.length) md += `- **Labels**: ${net.labels.map((l) => `"${l.label}" at ${l.point}`).join(", ")}\n`;
      if (net.cells.length) md += `- **Breadboard Points**: ${net.cells.join(", ")}\n`;
      md += `\n`;
    }
  }

  md += `## Suggested Pin Defines (Copy into firmware)\n\n`;
  md += `\`\`\`cpp\n`;
  md += `// Auto-generated pin definitions from breadboard layout\n`;
  const seenDefines = new Set();
  for (const net of espNets) {
    for (const pin of net.espPins) {
      if (["GND", "5V", "3.3V"].includes(pin)) continue;
      const gpioNum = pin.replace("GPIO", "");
      const defName = net.labels.length > 0
        ? net.labels[0].label.toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_PIN"
        : `PIN_${pin}`;
      if (!seenDefines.has(defName)) {
        md += `#define ${defName} ${gpioNum}\n`;
        seenDefines.add(defName);
      }
    }
  }
  md += `\`\`\`\n`;

  return md;
}


// ── Schematic View ──

function SchematicView({ wires, labels, onClose }) {
  const { nets } = useMemo(() => analyzeNets(wires, labels), [wires, labels]);
  const espNets = nets.filter((n) => n.espPins.length > 0);

  const uniqueLeft = [...new Set(Object.values(ESP32_LEFT_PINS).filter((p) => p !== "X"))];
  const uniqueRight = [...new Set(Object.values(ESP32_RIGHT_PINS).filter((p) => p !== "X"))];
  const maxPins = Math.max(uniqueLeft.length, uniqueRight.length);

  const chipW = 160;
  const chipH = maxPins * 28 + 40;
  const svgW = 900;
  const svgH = chipH + 80;
  const chipX = svgW / 2 - chipW / 2;
  const chipY = 40;
  const pinH = 28;
  const pinStartY = chipY + 32;

  const pinColor = (name) => {
    if (name === "GND") return "#3b82f6";
    if (name === "5V") return "#ef4444";
    if (name === "3.3V") return "#f59e0b";
    return "#4ade80";
  };

  const pinHasConnection = (pinName) =>
    espNets.some((n) => n.espPins.includes(pinName) && (n.rails.length > 0 || n.labels.length > 0 || n.cells.length > 0));

  const getNetLabel = (pinName) => {
    const net = espNets.find((n) => n.espPins.includes(pinName));
    if (!net) return null;
    if (net.labels.length > 0) return net.labels[0].label;
    if (net.rails.length > 0) return net.rails[0].includes("+") ? "VCC Rail" : "GND Rail";
    if (net.cells.length > 0) return net.cells[0];
    return null;
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0d0d15f0", zIndex: 150, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #333", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#13131f" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: 1, color: "#e0e0e0", fontFamily: "'JetBrains Mono', monospace" }}>SCHEMATIC VIEW</span>
          <span style={{ fontSize: 10, color: "#666" }}>{espNets.length} connected nets / {wires.length} wires</span>
        </div>
        <button onClick={onClose} style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid #444", background: "#1a1a2e", color: "#ccc", cursor: "pointer", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>Close</button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", justifyContent: "center" }}>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} width={svgW} height={svgH} style={{ maxWidth: "100%" }}>
          <defs>
            <filter id="glow"><feGaussianBlur stdDeviation="2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          <pattern id="schGrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1a1a2e" strokeWidth="0.5" />
          </pattern>
          <rect width={svgW} height={svgH} fill="#0f0f17" />
          <rect width={svgW} height={svgH} fill="url(#schGrid)" />

          {/* Chip body */}
          <rect x={chipX} y={chipY} width={chipW} height={chipH} rx={8} fill="#1a2e1a" stroke="#2d7d46" strokeWidth={2} />
          <rect x={chipX + chipW / 2 - 20} y={chipY + chipH - 6} width={40} height={12} rx={4} fill="#333" stroke="#555" strokeWidth={0.5} />
          <text x={chipX + chipW / 2} y={chipY + chipH + 2} textAnchor="middle" fontSize={6} fill="#888" fontFamily="monospace">USB-C</text>
          <text x={chipX + chipW / 2} y={chipY + 18} textAnchor="middle" fontSize={10} fill="#4ade80" fontWeight="bold" fontFamily="monospace">ESP32 LOLIN32</text>

          {/* Left pins */}
          {uniqueLeft.map((pin, i) => {
            const py = pinStartY + i * pinH;
            const connected = pinHasConnection(pin);
            const label = getNetLabel(pin);
            const col = pinColor(pin);
            return (
              <g key={`lp-${pin}`}>
                <line x1={chipX} y1={py} x2={chipX - 24} y2={py} stroke={col} strokeWidth={connected ? 2 : 1} opacity={connected ? 1 : 0.35} />
                <circle cx={chipX - 24} cy={py} r={3.5} fill={connected ? col : "#333"} stroke={col} strokeWidth={1} />
                <text x={chipX + 8} y={py + 1} dominantBaseline="middle" fontSize={8} fill={col} fontFamily="monospace" fontWeight="bold" opacity={connected ? 1 : 0.35}>{pin}</text>
                {connected && label && (
                  <>
                    <line x1={chipX - 24} y1={py} x2={chipX - 130} y2={py} stroke={col} strokeWidth={1.5} strokeDasharray="4,2" filter="url(#glow)" />
                    <rect x={chipX - 244} y={py - 11} width={110} height={22} rx={5} fill="#13131f" stroke={col} strokeWidth={1} opacity={0.92} />
                    <text x={chipX - 189} y={py + 1} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill={col} fontFamily="monospace" fontWeight="bold">{label}</text>
                  </>
                )}
              </g>
            );
          })}

          {/* Right pins */}
          {uniqueRight.map((pin, i) => {
            const py = pinStartY + i * pinH;
            const connected = pinHasConnection(pin);
            const label = getNetLabel(pin);
            const col = pinColor(pin);
            return (
              <g key={`rp-${pin}`}>
                <line x1={chipX + chipW} y1={py} x2={chipX + chipW + 24} y2={py} stroke={col} strokeWidth={connected ? 2 : 1} opacity={connected ? 1 : 0.35} />
                <circle cx={chipX + chipW + 24} cy={py} r={3.5} fill={connected ? col : "#333"} stroke={col} strokeWidth={1} />
                <text x={chipX + chipW - 8} y={py + 1} dominantBaseline="middle" textAnchor="end" fontSize={8} fill={col} fontFamily="monospace" fontWeight="bold" opacity={connected ? 1 : 0.35}>{pin}</text>
                {connected && label && (
                  <>
                    <line x1={chipX + chipW + 24} y1={py} x2={chipX + chipW + 130} y2={py} stroke={col} strokeWidth={1.5} strokeDasharray="4,2" filter="url(#glow)" />
                    <rect x={chipX + chipW + 134} y={py - 11} width={110} height={22} rx={5} fill="#13131f" stroke={col} strokeWidth={1} opacity={0.92} />
                    <text x={chipX + chipW + 189} y={py + 1} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill={col} fontFamily="monospace" fontWeight="bold">{label}</text>
                  </>
                )}
              </g>
            );
          })}

          {/* Legend */}
          {[
            { color: "#4ade80", text: "Signal GPIO" },
            { color: "#ef4444", text: "5V Power" },
            { color: "#f59e0b", text: "3.3V Power" },
            { color: "#3b82f6", text: "Ground" },
            { color: "#666", text: "Unconnected" },
          ].map((item, i) => (
            <g key={`leg-${i}`}>
              <circle cx={20} cy={svgH - 60 + i * 14} r={4} fill={item.color} />
              <text x={32} y={svgH - 59 + i * 14} dominantBaseline="middle" fontSize={9} fill="#888" fontFamily="monospace">{item.text}</text>
            </g>
          ))}
          <text x={svgW - 10} y={svgH - 10} textAnchor="end" fontSize={8} fill="#333" fontFamily="monospace">Generated from breadboard layout</text>
        </svg>
      </div>
    </div>
  );
}


// ── Board sub-components ──

function Hole({ x, y, occupied, isEsp, espLabel, isX, onClick, highlight, selected }) {
  const fill = isX ? "#555" : isEsp ? "#2d7d46" : occupied ? "#ff9800" : "#1a1a2e";
  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      <rect x={x - CELL_SIZE / 2} y={y - CELL_SIZE / 2} width={CELL_SIZE} height={CELL_SIZE} rx={3}
        fill={highlight ? "rgba(255,255,120,0.3)" : "transparent"}
        stroke={selected ? "#ffd700" : highlight ? "#ffd70088" : "transparent"} strokeWidth={selected ? 2 : 1} />
      <circle cx={x} cy={y} r={4.5} fill={fill} stroke="#0005" strokeWidth={0.5} />
      {isEsp && espLabel && (
        <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={5.5} fontWeight="bold" fill="#fff" style={{ pointerEvents: "none" }}>
          {espLabel.replace("GPIO", "")}
        </text>
      )}
    </g>
  );
}

function RailHole({ x, y, isPlus, onClick, highlight, selected }) {
  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      <rect x={x - RAIL_WIDTH / 2} y={y - CELL_SIZE / 2} width={RAIL_WIDTH} height={CELL_SIZE} rx={2}
        fill={highlight ? "rgba(255,255,120,0.2)" : "transparent"}
        stroke={selected ? "#ffd700" : "transparent"} strokeWidth={selected ? 2 : 0} />
      <circle cx={x} cy={y} r={4} fill={isPlus ? "#c53030" : "#2b6cb0"} stroke="#0004" strokeWidth={0.5} />
    </g>
  );
}

function WirePath({ from, to, color, onClick, onContextMenu, isHovered }) {
  const p1 = getPointPos(from);
  const p2 = getPointPos(to);
  if (!p1 || !p2) return null;
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const sag = Math.min(dist * 0.18, 30);
  const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2 - sag;
  const handleCtx = (e) => { e.preventDefault(); e.stopPropagation(); if (onContextMenu) onContextMenu(e); };
  return (
    <g onClick={onClick} onContextMenu={handleCtx} style={{ cursor: "pointer" }}>
      <path d={`M${p1.x},${p1.y} Q${mx},${my} ${p2.x},${p2.y}`} stroke={isHovered ? "#fff" : color} strokeWidth={isHovered ? 4 : 3} fill="none" strokeLinecap="round" opacity={0.92} />
      <path d={`M${p1.x},${p1.y} Q${mx},${my} ${p2.x},${p2.y}`} stroke="transparent" strokeWidth={14} fill="none" />
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
      <text x={x + w / 2} y={y + h / 2 - 4} textAnchor="middle" fontSize={7} fill="#4ade80" fontWeight="bold" fontFamily="monospace">ESP32 LOLIN32</text>
      <text x={x + w / 2} y={y + h / 2 + 5} textAnchor="middle" fontSize={5} fill="#4ade8088" fontFamily="monospace">V1.0.0</text>
    </g>
  );
}


function ServoConnector({ col, startRow, label }) {
  const top = getCellPos(col, startRow);
  const bot = getCellPos(col, startRow + 2);
  if (!top || !bot) return null;
  const pad = 4;
  const x = top.x - CELL_SIZE / 2 - pad;
  const y = top.y - CELL_SIZE / 2 - pad;
  const w = CELL_SIZE + pad * 2;
  const h = bot.y - top.y + CELL_SIZE + pad * 2;
  const pins = [
    { row: startRow, color: "#ecc94b" },      // Yellow - Signal
    { row: startRow + 1, color: "#e53e3e" },   // Red - VCC
    { row: startRow + 2, color: "#8B5E3C" },   // Brown - GND
  ];
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={4} fill="#2a2a2a" stroke="#555" strokeWidth={1} opacity={0.9} />
      {pins.map(({ row, color }) => {
        const pos = getCellPos(col, row);
        if (!pos) return null;
        return <rect key={row} x={pos.x - 4} y={pos.y - 4} width={8} height={8} rx={1.5} fill={color} stroke="#0004" strokeWidth={0.5} />;
      })}
      <text x={x + w / 2} y={y - 3} textAnchor="middle" fontSize={5.5} fill="#aaa" fontWeight="bold" fontFamily="monospace">{label}</text>
      <text x={x + w / 2} y={y + h + 7} textAnchor="middle" fontSize={4} fill="#666" fontFamily="monospace">MG995</text>
    </g>
  );
}


// ── Markdown Preview Modal ──

function MarkdownPreview({ markdown, onClose, onDownload }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 12, width: "90%", maxWidth: 720, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #333", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: "#d6bcfa", fontFamily: "'JetBrains Mono', monospace" }}>Markdown Preview</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onDownload} style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid #805ad5", background: "#2d1f5e", color: "#d6bcfa", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
              Download .md
            </button>
            <button onClick={onClose} style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid #444", background: "#1a1a2e", color: "#ccc", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
              Close
            </button>
          </div>
        </div>
        <pre style={{ flex: 1, overflow: "auto", padding: 16, margin: 0, fontSize: 11, color: "#ccc", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6, whiteSpace: "pre-wrap", background: "#0f0f17" }}>
          {markdown}
        </pre>
      </div>
    </div>
  );
}


// ── Default wiring: 2x MG995-180 Servo Motors ──

const DEFAULT_WIRES = [
  // Servo 1 (connector at f1–f3, jumpers from g1–g3 on same bus)
  { from: { type: "cell", col: "g", row: 1 }, to: { type: "cell", col: "a", row: 23 }, color: "#ecc94b", id: 1 },  // Yellow - Signal → GPIO25
  { from: { type: "cell", col: "g", row: 2 }, to: { type: "rail", rail: "left+", row: 2 }, color: "#e53e3e", id: 2 },  // Red - VCC
  { from: { type: "cell", col: "g", row: 3 }, to: { type: "rail", rail: "left-", row: 3 }, color: "#8B5E3C", id: 3 },  // Brown - GND
  // Servo 2 (connector at f5–f7, jumpers from g5–g7 on same bus)
  { from: { type: "cell", col: "g", row: 5 }, to: { type: "cell", col: "a", row: 24 }, color: "#ecc94b", id: 4 },  // Yellow - Signal → GPIO26
  { from: { type: "cell", col: "g", row: 6 }, to: { type: "rail", rail: "left+", row: 6 }, color: "#e53e3e", id: 5 },  // Red - VCC
  { from: { type: "cell", col: "g", row: 7 }, to: { type: "rail", rail: "left-", row: 7 }, color: "#8B5E3C", id: 6 },  // Brown - GND
  // Power distribution (GND only — 5V rail fed from external supply, not ESP32)
  { from: { type: "cell", col: "a", row: 30 }, to: { type: "rail", rail: "left-", row: 30 }, color: "#1a1a2e", id: 7 },  // GND to rail
];

const DEFAULT_LABELS = {
  "g1": "S1 SIG", "g2": "S1 VCC", "g3": "S1 GND",
  "g5": "S2 SIG", "g6": "S2 VCC", "g7": "S2 GND",
  "left-:30": "GND",
};


// ── Main App ──

export default function BreadboardApp() {
  const [wires, setWires] = useState(DEFAULT_WIRES);
  const [selectedColor, setSelectedColor] = useState(WIRE_COLORS[0].hex);
  const [wireStart, setWireStart] = useState(null);
  const [hoveredWire, setHoveredWire] = useState(null);
  const [tool, setTool] = useState("wire");
  const [labels, setLabels] = useState(DEFAULT_LABELS);
  const [labelInput, setLabelInput] = useState("");
  const [labelTarget, setLabelTarget] = useState(null);
  const [history, setHistory] = useState([]);
  const [showPinRef, setShowPinRef] = useState(false);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [viewMode, setViewMode] = useState("board");
  const [showMdPreview, setShowMdPreview] = useState(false);
  const svgRef = useRef(null);

  // Pan & zoom state
  const [vb, setVb] = useState({ x: 0, y: 0, w: BOARD_W, h: BOARD_H });
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panRef = useRef({ startX: 0, startY: 0, vbX: 0, vbY: 0 });
  const spaceRef = useRef(false);

  const MIN_ZOOM = 0.25; // viewBox can be up to 4x board size
  const MAX_ZOOM = 5;    // viewBox can be as small as 1/5 board size

  const screenToSvg = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = vb.w / rect.width;
    const scaleY = vb.h / rect.height;
    return { x: vb.x + (clientX - rect.left) * scaleX, y: vb.y + (clientY - rect.top) * scaleY };
  }, [vb]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    setVb((prev) => {
      const newW = prev.w * zoomFactor;
      const newH = prev.h * zoomFactor;
      if (newW > BOARD_W / MIN_ZOOM || newW < BOARD_W / MAX_ZOOM) return prev;
      const svg = svgRef.current;
      if (!svg) return prev;
      const rect = svg.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;
      return {
        x: prev.x - (newW - prev.w) * mx,
        y: prev.y - (newH - prev.h) * my,
        w: newW,
        h: newH,
      };
    });
  }, []);

  const handlePanStart = useCallback((e) => {
    if (e.button === 1 || spaceRef.current) {
      e.preventDefault();
      setIsPanning(true);
      panRef.current = { startX: e.clientX, startY: e.clientY, vbX: vb.x, vbY: vb.y };
    }
  }, [vb]);

  const handlePanMove = useCallback((e) => {
    if (!isPanning) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = (e.clientX - panRef.current.startX) * (vb.w / rect.width);
    const dy = (e.clientY - panRef.current.startY) * (vb.h / rect.height);
    setVb((prev) => ({ ...prev, x: panRef.current.vbX - dx, y: panRef.current.vbY - dy }));
  }, [isPanning, vb.w, vb.h]);

  const handlePanEnd = useCallback(() => { setIsPanning(false); }, []);

  const resetView = useCallback(() => {
    setVb({ x: 0, y: 0, w: BOARD_W, h: BOARD_H });
  }, []);

  // Spacebar for pan mode
  useEffect(() => {
    const down = (e) => { if (e.code === "Space" && !e.repeat && e.target === document.body) { e.preventDefault(); spaceRef.current = true; setSpaceHeld(true); } };
    const up = (e) => { if (e.code === "Space") { spaceRef.current = false; setSpaceHeld(false); setIsPanning(false); } };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // Global mouse up to end pan even if cursor leaves SVG
  useEffect(() => {
    if (isPanning) {
      window.addEventListener("mousemove", handlePanMove);
      window.addEventListener("mouseup", handlePanEnd);
      return () => { window.removeEventListener("mousemove", handlePanMove); window.removeEventListener("mouseup", handlePanEnd); };
    }
  }, [isPanning, handlePanMove, handlePanEnd]);

  // Attach wheel handler with passive: false for preventDefault
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const pushHistory = useCallback(() => {
    setHistory((h) => [...h.slice(-30), JSON.stringify(wires)]);
  }, [wires]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    setHistory((h) => h.slice(0, -1));
    setWires(JSON.parse(history[history.length - 1]));
  }, [history]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") { e.preventDefault(); undo(); }
      if (e.key === "Escape") { setWireStart(null); setLabelTarget(null); setCtxMenu(null); }
    };
    const clickAway = () => setCtxMenu(null);
    window.addEventListener("keydown", handler);
    window.addEventListener("click", clickAway);
    return () => { window.removeEventListener("keydown", handler); window.removeEventListener("click", clickAway); };
  }, [undo]);

  const pointKey = (p) => p.type === "rail" ? `${p.rail}:${p.row}` : `${p.col}${p.row}`;

  const handleCellClick = (point) => {
    if (tool === "label") { setLabelTarget(point); setLabelInput(labels[pointKey(point)] || ""); return; }
    if (tool === "eraser") {
      pushHistory();
      setWires((w) => w.filter((wire) => pointKey(wire.from) !== pointKey(point) && pointKey(wire.to) !== pointKey(point)));
      const k = pointKey(point);
      if (labels[k]) setLabels((l) => { const c = { ...l }; delete c[k]; return c; });
      return;
    }
    if (!wireStart) setWireStart(point);
    else {
      if (pointKey(wireStart) !== pointKey(point)) {
        pushHistory();
        setWires((w) => [...w, { from: wireStart, to: point, color: selectedColor, id: Date.now() }]);
      }
      setWireStart(null);
    }
  };

  const saveLabel = () => {
    if (!labelTarget) return;
    const k = pointKey(labelTarget);
    setLabels((l) => labelInput.trim() ? { ...l, [k]: labelInput.trim() } : (() => { const c = { ...l }; delete c[k]; return c; })());
    setLabelTarget(null); setLabelInput("");
  };

  const deleteWire = (id) => { pushHistory(); setWires((w) => w.filter((wire) => wire.id !== id)); };
  const changeWireColor = (id, c) => { pushHistory(); setWires((w) => w.map((wire) => wire.id === id ? { ...wire, color: c } : wire)); };

  const doDownloadMd = () => {
    const md = generateMarkdown(wires, labels);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `esp32-wiring-${new Date().toISOString().split("T")[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    if (wires.length === 0 && Object.keys(labels).length === 0) return;
    pushHistory(); setWires([]); setLabels({});
  };

  const occupiedPoints = new Set();
  wires.forEach((w) => { occupiedPoints.add(pointKey(w.from)); occupiedPoints.add(pointKey(w.to)); });

  const espRows = ROWS.filter((r) => r >= 15 && r <= 30);

  const renderMainGrid = () => {
    const els = [];
    ROWS.forEach((row) => COLS.forEach((col) => {
      const pos = getCellPos(col, row);
      if (!pos) return;
      const isEspLeft = col === "b" && row >= 15 && row <= 30;
      const isEspRight = col === "i" && row >= 15 && row <= 30;
      const isEsp = isEspLeft || isEspRight;
      const espLabel = isEspLeft ? ESP32_LEFT_PINS[row] : isEspRight ? ESP32_RIGHT_PINS[row] : null;
      const isX = espLabel === "X";
      if (row >= 15 && row <= 30 && ["c", "d", "e", "f", "g", "h"].includes(col)) return;
      const isServoPin = col === "f" && ((row >= 1 && row <= 3) || (row >= 5 && row <= 7));
      const k = `${col}${row}`;
      const isSelected = wireStart && pointKey(wireStart) === k;
      const isHighlight = wireStart && wireStart.type !== "rail" && wireStart.row === row &&
        ((COLS.indexOf(wireStart.col) < 5 && COLS.indexOf(col) < 5) || (COLS.indexOf(wireStart.col) >= 5 && COLS.indexOf(col) >= 5));
      els.push(<Hole key={k} x={pos.x} y={pos.y} occupied={occupiedPoints.has(k)} isEsp={isEsp} espLabel={espLabel} isX={isX || isServoPin}
        onClick={() => !isX && !isServoPin && handleCellClick({ type: "cell", col, row })} highlight={isHighlight} selected={isSelected} />);
    }));
    return els;
  };

  const renderRails = () => {
    const els = [];
    ROWS.forEach((row) => POWER_RAILS.forEach((rail) => {
      const pos = getRailPos(rail, row);
      const k = `${rail}:${row}`;
      els.push(<RailHole key={k} x={pos.x} y={pos.y} isPlus={rail.includes("+")}
        onClick={() => handleCellClick({ type: "rail", rail, row })}
        highlight={wireStart && wireStart.type === "rail" && wireStart.rail === rail}
        selected={wireStart && pointKey(wireStart) === k} />);
    }));
    return els;
  };

  const renderLabels = () => Object.entries(labels).map(([key, text]) => {
    let pos;
    if (key.includes(":")) { const [rail, row] = key.split(":"); pos = getRailPos(rail, parseInt(row)); }
    else pos = getCellPos(key[0], parseInt(key.slice(1)));
    if (!pos) return null;
    return (
      <g key={`label-${key}`}>
        <rect x={pos.x - 1} y={pos.y - 15} width={text.length * 5 + 6} height={11} rx={2} fill="#ffd700cc" />
        <text x={pos.x + 2} y={pos.y - 8} fontSize={7} fill="#1a1a2e" fontFamily="monospace" fontWeight="bold">{text}</text>
      </g>
    );
  });

  const renderRowNumbers = () => {
    const leftX = LEFT_PAD + RAIL_WIDTH + GAP + RAIL_WIDTH + GAP + GUTTER / 2 - 2;
    const rightX = LEFT_PAD + RAIL_WIDTH + GAP + RAIL_WIDTH + GAP + GUTTER + 5 * (CELL_SIZE + GAP) + CENTER_GAP + 5 * (CELL_SIZE + GAP) + GUTTER / 2 + 2;
    return ROWS.map((row) => {
      const y = HEADER_H + TOP_PAD + (row - 1) * (CELL_SIZE + GAP) + CELL_SIZE / 2;
      return (<g key={`rn-${row}`}>
        <text x={leftX} y={y} textAnchor="middle" dominantBaseline="central" fontSize={7} fill="#888" fontFamily="monospace">{row}</text>
        <text x={rightX} y={y} textAnchor="middle" dominantBaseline="central" fontSize={7} fill="#888" fontFamily="monospace">{row}</text>
      </g>);
    });
  };

  const renderColHeaders = () => COLS.map((col) => {
    const pos = getCellPos(col, 1);
    return pos ? <text key={`ch-${col}`} x={pos.x} y={HEADER_H - 6} textAnchor="middle" fontSize={9} fill="#aaa" fontWeight="bold" fontFamily="monospace">{col}</text> : null;
  });

  const renderRailLabels = () => [
    { rail: "left+", label: "+" }, { rail: "left-", label: "−" },
    { rail: "right+", label: "+" }, { rail: "right-", label: "−" },
  ].map(({ rail, label }) => {
    const pos = getRailPos(rail, 1);
    return <text key={`rl-${rail}`} x={pos.x} y={HEADER_H - 6} textAnchor="middle" fontSize={11} fill={label === "+" ? "#e53e3e" : "#3182ce"} fontWeight="bold" fontFamily="monospace">{label}</text>;
  });

  const pinRefData = espRows.map((r) => ({ row: r, left: ESP32_LEFT_PINS[r], right: ESP32_RIGHT_PINS[r] }));

  const mdContent = useMemo(() => generateMarkdown(wires, labels), [wires, labels]);

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f17", color: "#e0e0e0", fontFamily: "'JetBrains Mono', 'Fira Code', monospace", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #1a1a2e; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        .tool-btn { padding: 6px 14px; border-radius: 6px; border: 1px solid #333; background: #1a1a2e; color: #ccc; cursor: pointer; font-size: 12px; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
        .tool-btn:hover { border-color: #555; background: #252540; }
        .tool-btn.active { border-color: #4ade80; color: #4ade80; background: #1a2e1a; }
        .tool-btn.accent { border-color: #805ad5; color: #d6bcfa; }
        .tool-btn.accent:hover { background: #2d1f5e; border-color: #9f7aea; }
        .color-dot { width: 24px; height: 24px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: all 0.15s; flex-shrink: 0; }
        .color-dot:hover { transform: scale(1.15); }
        .color-dot.active { border-color: #fff; box-shadow: 0 0 8px #fff4; }
        .wire-list-item { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; transition: background 0.1s; }
        .wire-list-item:hover { background: #ffffff10; }
        .del-btn { background: none; border: none; color: #e53e3e; cursor: pointer; font-size: 14px; padding: 0 4px; opacity: 0.6; transition: opacity 0.1s; }
        .del-btn:hover { opacity: 1; }
        .panel { background: #13131f; border: 1px solid #222; border-radius: 8px; padding: 12px; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #222", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", background: "#13131f" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: wireStart ? "#ffd700" : "#4ade80", boxShadow: wireStart ? "0 0 8px #ffd700" : "0 0 6px #4ade80" }} />
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: 1 }}>BREADBOARD</span>
          <span style={{ fontSize: 10, color: "#666", marginLeft: 4 }}>ESP32 LOLIN32</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className={`tool-btn ${tool === "wire" ? "active" : ""}`} onClick={() => { setTool("wire"); setWireStart(null); }}>⚡ Wire</button>
          <button className={`tool-btn ${tool === "label" ? "active" : ""}`} onClick={() => { setTool("label"); setWireStart(null); }}>🏷 Label</button>
          <button className={`tool-btn ${tool === "eraser" ? "active" : ""}`} onClick={() => { setTool("eraser"); setWireStart(null); }}>🗑 Eraser</button>
        </div>
        {tool === "wire" && (
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {WIRE_COLORS.map((c) => (
              <div key={c.hex} className={`color-dot ${selectedColor === c.hex ? "active" : ""}`}
                style={{ background: c.hex }} onClick={() => setSelectedColor(c.hex)} title={c.name} />
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
          <button className="tool-btn" onClick={undo} disabled={history.length === 0} style={{ opacity: history.length ? 1 : 0.4 }}>↩ Undo</button>
          <button className="tool-btn" onClick={clearAll}>Clear All</button>
          <button className="tool-btn" onClick={() => setShowPinRef(!showPinRef)}>{showPinRef ? "Hide" : "📌"} Pins</button>
          <div style={{ width: 1, background: "#333", margin: "0 2px" }} />
          <button className="tool-btn" onClick={resetView} style={{ opacity: (vb.x !== 0 || vb.y !== 0 || vb.w !== BOARD_W) ? 1 : 0.4 }}>⊞ Reset View</button>
          <button className="tool-btn accent" onClick={() => setViewMode("schematic")}>⚙ Schematic</button>
          <button className="tool-btn accent" onClick={() => setShowMdPreview(true)}>📄 Preview .md</button>
          <button className="tool-btn accent" onClick={doDownloadMd}>⬇ Export .md</button>
        </div>
      </div>

      {/* Status bar */}
      <div style={{ padding: "6px 20px", fontSize: 11, color: "#666", borderBottom: "1px solid #1a1a2e", display: "flex", gap: 16 }}>
        <span>{wires.length} wire{wires.length !== 1 ? "s" : ""}</span>
        <span>{Object.keys(labels).length} label{Object.keys(labels).length !== 1 ? "s" : ""}</span>
        {wireStart && <span style={{ color: "#ffd700" }}>Click second point to complete wire from {pointKey(wireStart)} (Esc to cancel)</span>}
        {tool === "eraser" && <span style={{ color: "#e53e3e" }}>Click a hole to remove all wires/labels at that point</span>}
        {tool === "label" && <span style={{ color: "#805ad5" }}>Click any hole to add a label</span>}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Main board */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            style={{ display: "block", width: "100%", height: "100%", cursor: isPanning ? "grabbing" : spaceHeld ? "grab" : "default" }}
            onContextMenu={(e) => e.preventDefault()}
            onMouseDown={handlePanStart}>
            <rect x={0} y={0} width={BOARD_W} height={BOARD_H} rx={8} fill="#e8e0d0" />
            <rect x={3} y={3} width={BOARD_W - 6} height={BOARD_H - 6} rx={6} fill="#d4cbb8" />
            {(() => {
              const le = getCellPos("e", 1), re = getCellPos("f", 1);
              if (!le || !re) return null;
              return <rect x={(le.x + re.x) / 2 - CENTER_GAP / 2} y={HEADER_H} width={CENTER_GAP} height={BOARD_H - HEADER_H - 6} fill="#c4b99e" rx={2} />;
            })()}
            {renderRailLabels()}
            {renderColHeaders()}
            {renderRowNumbers()}
            {renderRails()}
            {renderMainGrid()}
            <ESP32Outline />
            <ServoConnector col="f" startRow={1} label="SERVO 1" />
            <ServoConnector col="f" startRow={5} label="SERVO 2" />
            {wires.map((w) => (
              <WirePath key={w.id} from={w.from} to={w.to} color={w.color}
                isHovered={hoveredWire === w.id || (ctxMenu && ctxMenu.wireId === w.id)}
                onClick={() => { if (tool === "eraser") deleteWire(w.id); }}
                onContextMenu={(e) => setCtxMenu({ wireId: w.id, x: e.clientX, y: e.clientY })} />
            ))}
            {wireStart && (() => {
              const pos = getPointPos(wireStart);
              if (!pos) return null;
              return (<circle cx={pos.x} cy={pos.y} r={7} fill="none" stroke="#ffd700" strokeWidth={2} strokeDasharray="3,2">
                <animate attributeName="r" values="7;10;7" dur="1s" repeatCount="indefinite" />
              </circle>);
            })()}
            {renderLabels()}
          </svg>
        </div>

        {/* Sidebar */}
        <div style={{ width: 260, borderLeft: "1px solid #222", background: "#0f0f17", overflow: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 }}>
          <div className="panel">
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, color: "#888", letterSpacing: 1 }}>WIRES</div>
            {wires.length === 0 && <div style={{ fontSize: 11, color: "#555", padding: "8px 0" }}>No wires yet. Click two points with the Wire tool.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {wires.map((w) => (
                <div key={w.id} className="wire-list-item" onMouseEnter={() => setHoveredWire(w.id)} onMouseLeave={() => setHoveredWire(null)}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: w.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontFamily: "monospace", fontSize: 10 }}>{pointKey(w.from)} → {pointKey(w.to)}</span>
                  <button className="del-btn" onClick={() => deleteWire(w.id)} title="Delete wire">×</button>
                </div>
              ))}
            </div>
          </div>
          {showPinRef && (
            <div className="panel">
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, color: "#888", letterSpacing: 1 }}>ESP32 PIN MAP</div>
              <div style={{ fontSize: 9, fontFamily: "monospace", lineHeight: 1.8, display: "grid", gridTemplateColumns: "auto 30px auto", gap: "0 8px", alignItems: "center" }}>
                <div style={{ fontWeight: 700, color: "#666", borderBottom: "1px solid #222", paddingBottom: 2 }}>Left (b)</div>
                <div style={{ fontWeight: 700, color: "#666", borderBottom: "1px solid #222", paddingBottom: 2, textAlign: "center" }}>Row</div>
                <div style={{ fontWeight: 700, color: "#666", borderBottom: "1px solid #222", paddingBottom: 2, textAlign: "right" }}>Right (i)</div>
                {pinRefData.map(({ row, left, right }) => {
                  const lc = left === "X" ? "#555" : left === "GND" ? "#3182ce" : left === "5V" ? "#e53e3e" : "#4ade80";
                  const rc = right === "X" ? "#555" : right === "GND" ? "#3182ce" : right === "3.3V" ? "#dd6b20" : "#4ade80";
                  return [
                    <div key={`l${row}`} style={{ color: lc }}>{left}</div>,
                    <div key={`r${row}c`} style={{ textAlign: "center", color: "#444" }}>{row}</div>,
                    <div key={`r${row}`} style={{ textAlign: "right", color: rc }}>{right}</div>,
                  ];
                })}
              </div>
            </div>
          )}
          <div className="panel" style={{ fontSize: 10, color: "#555", lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: "#666" }}>CONTROLS</div>
            <div>Wire: click start, click end</div>
            <div>Label: click any hole to annotate</div>
            <div>Eraser: click hole or wire to remove</div>
            <div>Right-click wire to recolor/delete</div>
            <div>Ctrl/Cmd+Z to undo, Esc to cancel</div>
            <div style={{ borderTop: "1px solid #222", marginTop: 6, paddingTop: 6, color: "#666" }}>
              <span style={{ color: "#d6bcfa" }}>⚙ Schematic</span> pin-level diagram
            </div>
            <div><span style={{ color: "#d6bcfa" }}>📄 Export .md</span> wiring doc for AI firmware</div>
          </div>
        </div>
      </div>

      {/* Label modal */}
      {labelTarget && (
        <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setLabelTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 12, padding: 20, maxWidth: 420, width: "90%" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: "#aaa" }}>Label for {pointKey(labelTarget)}</div>
            <input autoFocus value={labelInput} onChange={(e) => setLabelInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveLabel()}
              placeholder="Enter label text..."
              style={{ width: "100%", padding: "8px 12px", background: "#0f0f17", border: "1px solid #444", borderRadius: 6, color: "#fff", fontFamily: "inherit", fontSize: 13, outline: "none" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="tool-btn" style={{ flex: 1 }} onClick={saveLabel}>Save</button>
              <button className="tool-btn" onClick={() => setLabelTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Wire context menu */}
      {ctxMenu && (() => {
        const wire = wires.find((w) => w.id === ctxMenu.wireId);
        if (!wire) return null;
        return (
          <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 200, background: "#1e1e30", border: "1px solid #444", borderRadius: 10, padding: "10px 12px", boxShadow: "0 8px 30px #000a", minWidth: 170 }}>
            <div style={{ fontSize: 10, color: "#666", fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>{pointKey(wire.from)} → {pointKey(wire.to)}</div>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>Change color</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
              {WIRE_COLORS.map((c) => (
                <div key={c.hex} onClick={() => { changeWireColor(ctxMenu.wireId, c.hex); setCtxMenu(null); }} title={c.name}
                  style={{ width: 22, height: 22, borderRadius: "50%", background: c.hex, cursor: "pointer",
                    border: wire.color === c.hex ? "2px solid #fff" : "2px solid transparent", transition: "transform 0.1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")} />
              ))}
            </div>
            <div style={{ borderTop: "1px solid #333", paddingTop: 8 }}>
              <button onClick={() => { deleteWire(ctxMenu.wireId); setCtxMenu(null); }}
                style={{ width: "100%", padding: "6px 0", background: "transparent", border: "1px solid #e53e3e44", borderRadius: 6, color: "#e53e3e", cursor: "pointer", fontSize: 11, fontFamily: "inherit", transition: "background 0.1s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#e53e3e18")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>Delete Wire</button>
            </div>
          </div>
        );
      })()}

      {/* Schematic overlay */}
      {viewMode === "schematic" && <SchematicView wires={wires} labels={labels} onClose={() => setViewMode("board")} />}

      {/* Markdown preview */}
      {showMdPreview && <MarkdownPreview markdown={mdContent} onClose={() => setShowMdPreview(false)} onDownload={() => { doDownloadMd(); setShowMdPreview(false); }} />}
    </div>
  );
}
