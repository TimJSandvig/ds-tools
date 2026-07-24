import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, Download, Trash2, ChevronUp, ChevronDown } from "lucide-react";

const CANVAS_W = 900;
const CANVAS_H = 600;
const HANDLE_R = 8;
const ROTATE_OFFSET = 32;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = reject;
    img.src = url;
  });
}

function cornerDist(w, h) {
  return Math.sqrt((w / 2) ** 2 + (h / 2) ** 2);
}

export default function LayerCompositor() {
  const [layers, setLayers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const idRef = useRef(0);
  const dragRef = useRef(null);

  const getHandlePositions = (layer) => {
    const w = layer.baseW * layer.scale;
    const h = layer.baseH * layer.scale;
    const cos = Math.cos(layer.rotation);
    const sin = Math.sin(layer.rotation);
    const toWorld = (lx, ly) => ({
      x: layer.x + lx * cos - ly * sin,
      y: layer.y + lx * sin + ly * cos,
    });
    return {
      corners: [
        toWorld(-w / 2, -h / 2),
        toWorld(w / 2, -h / 2),
        toWorld(w / 2, h / 2),
        toWorld(-w / 2, h / 2),
      ],
      scaleHandle: toWorld(w / 2, h / 2),
      rotateHandle: toWorld(0, -h / 2 - ROTATE_OFFSET),
      topCenter: toWorld(0, -h / 2),
    };
  };

  const drawChecker = (ctx) => {
    const size = 16;
    for (let y = 0; y < CANVAS_H; y += size) {
      for (let x = 0; x < CANVAS_W; x += size) {
        const even = (x / size + y / size) % 2 === 0;
        ctx.fillStyle = even ? "#2a2e37" : "#21242b";
        ctx.fillRect(x, y, size, size);
      }
    }
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawChecker(ctx);

    layers.forEach((layer) => {
      const w = layer.baseW * layer.scale;
      const h = layer.baseH * layer.scale;
      ctx.save();
      ctx.translate(layer.x, layer.y);
      ctx.rotate(layer.rotation);
      ctx.drawImage(layer.img, -w / 2, -h / 2, w, h);
      ctx.restore();
    });

    const selected = layers.find((l) => l.id === selectedId);
    if (selected) {
      const { corners, scaleHandle, rotateHandle, topCenter } = getHandlePositions(selected);
      ctx.save();
      ctx.strokeStyle = "#d99a4e";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(topCenter.x, topCenter.y);
      ctx.lineTo(rotateHandle.x, rotateHandle.y);
      ctx.stroke();

      ctx.fillStyle = "#d99a4e";
      ctx.beginPath();
      ctx.arc(scaleHandle.x, scaleHandle.y, HANDLE_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#191b20";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#5fb3a3";
      ctx.beginPath();
      ctx.arc(rotateHandle.x, rotateHandle.y, HANDLE_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#191b20";
      ctx.stroke();
      ctx.restore();
    }
  }, [layers, selectedId]);

  useEffect(() => { draw(); }, [draw]);

  const getCanvasPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const hitTestHandle = (layer, pt) => {
    const { scaleHandle, rotateHandle } = getHandlePositions(layer);
    if (Math.hypot(pt.x - scaleHandle.x, pt.y - scaleHandle.y) <= HANDLE_R + 4) return "scale";
    if (Math.hypot(pt.x - rotateHandle.x, pt.y - rotateHandle.y) <= HANDLE_R + 4) return "rotate";
    return null;
  };

  const hitTestBody = (layer, pt) => {
    const dx = pt.x - layer.x;
    const dy = pt.y - layer.y;
    const cos = Math.cos(-layer.rotation);
    const sin = Math.sin(-layer.rotation);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    const w = layer.baseW * layer.scale;
    const h = layer.baseH * layer.scale;
    return Math.abs(localX) <= w / 2 && Math.abs(localY) <= h / 2;
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    const pt = getCanvasPoint(e);
    const selected = layers.find((l) => l.id === selectedId);

    if (selected) {
      const handle = hitTestHandle(selected, pt);
      if (handle) {
        dragRef.current = {
          mode: handle,
          id: selected.id,
          startMouse: pt,
          startX: selected.x,
          startY: selected.y,
          cornerDist0: cornerDist(selected.baseW, selected.baseH),
        };
        setIsDragging(true);
        canvasRef.current.setPointerCapture(e.pointerId);
        return;
      }
    }

    for (let i = layers.length - 1; i >= 0; i--) {
      if (hitTestBody(layers[i], pt)) {
        setSelectedId(layers[i].id);
        dragRef.current = {
          mode: "move",
          id: layers[i].id,
          startMouse: pt,
          startX: layers[i].x,
          startY: layers[i].y,
        };
        setIsDragging(true);
        canvasRef.current.setPointerCapture(e.pointerId);
        return;
      }
    }
    setSelectedId(null);
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const pt = getCanvasPoint(e);
    const d = dragRef.current;

    setLayers((prev) =>
      prev.map((l) => {
        if (l.id !== d.id) return l;
        if (d.mode === "move") {
          return { ...l, x: d.startX + (pt.x - d.startMouse.x), y: d.startY + (pt.y - d.startMouse.y) };
        }
        if (d.mode === "scale") {
          const dist = Math.hypot(pt.x - l.x, pt.y - l.y);
          return { ...l, scale: Math.max(0.05, dist / d.cornerDist0) };
        }
        if (d.mode === "rotate") {
          return { ...l, rotation: Math.atan2(pt.y - l.y, pt.x - l.x) + Math.PI / 2 };
        }
        return l;
      })
    );
  };

  const handlePointerUp = () => {
    dragRef.current = null;
    setIsDragging(false);
  };

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    for (const file of files) {
      try {
        const { img, url } = await loadImage(file);
        const maxDim = Math.min(CANVAS_W, CANVAS_H) * 0.6;
        const scaleToFit = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const id = ++idRef.current;
        const newLayer = {
          id,
          img,
          url,
          baseW: img.naturalWidth,
          baseH: img.naturalHeight,
          x: CANVAS_W / 2,
          y: CANVAS_H / 2,
          scale: scaleToFit,
          rotation: 0,
          name: file.name,
        };
        setLayers((prev) => [...prev, newLayer]);
        setSelectedId(id);
      } catch (err) {
        console.error("Failed to load image", err);
      }
    }
  };

  const onFileInputChange = (e) => {
    handleFiles(e.target.files);
    e.target.value = "";
  };

  const deleteLayer = (id) => {
    setLayers((prev) => {
      const layer = prev.find((l) => l.id === id);
      if (layer && layer.url) URL.revokeObjectURL(layer.url);
      return prev.filter((l) => l.id !== id);
    });
    if (selectedId === id) setSelectedId(null);
  };

  const moveLayer = (id, dir) => {
    setLayers((prev) => {
      const idx = prev.findIndex((l) => l.id === id);
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[swapIdx]] = [copy[swapIdx], copy[idx]];
      return copy;
    });
  };

  const downloadFlattened = () => {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = CANVAS_W;
    exportCanvas.height = CANVAS_H;
    const ctx = exportCanvas.getContext("2d");
    layers.forEach((layer) => {
      const w = layer.baseW * layer.scale;
      const h = layer.baseH * layer.scale;
      ctx.save();
      ctx.translate(layer.x, layer.y);
      ctx.rotate(layer.rotation);
      ctx.drawImage(layer.img, -w / 2, -h / 2, w, h);
      ctx.restore();
    });
    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "flattened.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#191b20", color: "#e7e4dc", fontFamily: "-apple-system, 'Segoe UI', sans-serif", padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: "1px solid #383d48", paddingBottom: 14, marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
          <h1 style={{ fontFamily: "ui-monospace, monospace", fontSize: 15, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "#d99a4e", margin: 0 }}>
            Layer Compositor
          </h1>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#666c79" }}>
            PNG LAYER STACK — DRAG · SCALE · ROTATE
          </span>
        </div>

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div>
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              style={{
                maxWidth: "100%",
                height: "auto",
                border: "1px solid #383d48",
                borderRadius: 6,
                touchAction: "none",
                cursor: isDragging ? "grabbing" : "default",
                display: "block",
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <label htmlFor="layer-upload-input" style={btnStyle(true, false)}>
                <Upload size={14} /> Upload PNG
              </label>
              <input
                id="layer-upload-input"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={onFileInputChange}
                style={{ display: "none" }}
              />
              <button onClick={downloadFlattened} disabled={layers.length === 0} style={btnStyle(false, layers.length === 0)}>
                <Download size={14} /> Download flattened PNG
              </button>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={labelStyle}>Layers (top → bottom)</label>
            {layers.length === 0 && (
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#666c79", padding: "20px 0" }}>
                No layers yet. Upload a PNG to start.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[...layers].reverse().map((layer) => (
                <div
                  key={layer.id}
                  onClick={() => setSelectedId(layer.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: layer.id === selectedId ? "#2a2e37" : "#21242b",
                    border: `1px solid ${layer.id === selectedId ? "#8a6535" : "#383d48"}`,
                    borderRadius: 4,
                    padding: "7px 9px",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: layer.id === selectedId ? "#5fb3a3" : "#e7e4dc",
                    }}
                  >
                    {layer.name}
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 1); }} style={iconBtnStyle} title="Move up (forward)">
                    <ChevronUp size={13} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, -1); }} style={iconBtnStyle} title="Move down (backward)">
                    <ChevronDown size={13} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }} style={iconBtnStyle} title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 18, fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#666c79", lineHeight: 1.6 }}>
              <div>• Drag a layer's body to move it</div>
              <div>• Amber corner handle — drag to scale</div>
              <div>• Teal top handle — drag to rotate</div>
              <div>• Click empty canvas to deselect</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontFamily: "ui-monospace, monospace",
  fontSize: 10.5,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#666c79",
  marginBottom: 8,
};

function btnStyle(primary, disabled) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "ui-monospace, monospace",
    fontSize: 12,
    padding: "8px 14px",
    borderRadius: 4,
    border: `1px solid ${primary ? "#d99a4e" : "#383d48"}`,
    background: disabled ? "#21242b" : primary ? "#d99a4e" : "#21242b",
    color: disabled ? "#666c79" : primary ? "#191b20" : "#e7e4dc",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

const iconBtnStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "none",
  color: "#9498a3",
  cursor: "pointer",
  padding: 3,
};
