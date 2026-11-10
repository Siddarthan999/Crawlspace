import { useEffect, useRef, useState } from "react";
import { hierarchy, tree, HierarchyPointNode } from "d3-hierarchy";
import { linkHorizontal } from "d3-shape";
import { select } from "d3-selection";
import { zoom, zoomIdentity, ZoomBehavior } from "d3-zoom";
import "d3-transition";
import { Plus, Minus, RotateCcw, Maximize2, Folder } from "lucide-react";
import { api } from "../api";

interface TreeNode {
  name: string; path: string; count: number; truncated?: number;
  page: { id: number; url: string; status: number | null; title: string | null; indexable: boolean } | null;
  children: TreeNode[];
}

type HNode = HierarchyPointNode<TreeNode> & { _collapsedChildren?: TreeNode[] };

const ROW_H = 30;
const COL_W = 210;
const DEFAULT_EXPAND_DEPTH = 2;

const statusColor = (status: number | null | undefined) => {
  if (!status) return "var(--text-faint)";
  if (status >= 400) return "var(--error)";
  if (status >= 300) return "var(--warning)";
  return "var(--accent)";
};

export default function SiteTree({ cid, onOpenPage }: { cid: number; onOpenPage: (id: number) => void }) {
  const [raw, setRaw] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const rootHRef = useRef<any>(null);
  const [, bump] = useState(0);

  useEffect(() => {
    setLoading(true);
    api.pages.urlTree(cid).then((data) => { setRaw(data); setLoading(false); });
  }, [cid]);

  // build the d3 hierarchy once per crawl, pre-collapsing anything past the default depth
  useEffect(() => {
    if (!raw) return;
    const root: any = hierarchy(raw, (d) => d.children);
    root.each((n: any) => {
      if (n.depth >= DEFAULT_EXPAND_DEPTH && n.children) {
        n._collapsedChildren = n.children;
        n.children = null;
      }
    });
    rootHRef.current = root;
    bump((v) => v + 1);
  }, [raw]);

  const toggle = (d: any) => {
    if (d.children) { d._collapsedChildren = d.children; d.children = null; }
    else if (d._collapsedChildren) { d.children = d._collapsedChildren; d._collapsedChildren = null; }
    bump((v) => v + 1);
  };

  useEffect(() => {
    const root = rootHRef.current;
    if (!root || !svgRef.current || !containerRef.current) return;

    const visibleLeaves = root.copy().count().value || 1;
    const maxDepth = root.height;
    const width = Math.max(containerRef.current.clientWidth, (maxDepth + 1) * COL_W + 80);
    const height = Math.max(420, visibleLeaves * ROW_H + 60);

    const layout = tree<TreeNode>().nodeSize([ROW_H, COL_W]);
    layout(root);

    // swap x/y for a left-to-right orientation, center vertically
    let minX = Infinity, maxX = -Infinity;
    root.each((n: any) => { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); });
    const offsetY = 40;
    const offsetX = height / 2 - (minX + maxX) / 2;

    const svg = select(svgRef.current);
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);
    svg.selectAll("*").remove();

    const defs = svg.append("defs");
    const pattern = defs.append("pattern").attr("id", `tree-grid-${cid}`).attr("width", 22).attr("height", 22).attr("patternUnits", "userSpaceOnUse");
    pattern.append("circle").attr("cx", 1).attr("cy", 1).attr("r", 1).attr("fill", "var(--border-soft)");

    const g = svg.append("g");
    g.append("rect").attr("x", -2000).attr("y", -2000).attr("width", width + 4000).attr("height", height + 4000).attr("fill", `url(#tree-grid-${cid})`);
    const root_g = g.append("g").attr("transform", `translate(${offsetY},${offsetX})`);

    const linkGen = linkHorizontal<any, any>().x((d: any) => d.y).y((d: any) => d.x);
    root_g.append("g").attr("fill", "none").attr("stroke", "var(--border)").attr("stroke-width", 1.4)
      .selectAll("path").data(root.links()).join("path").attr("d", linkGen as any);

    const nodeG = root_g.append("g").selectAll("g").data(root.descendants()).join("g")
      .attr("transform", (d: any) => `translate(${d.y},${d.x})`);

    nodeG.each(function (d: any) {
      const sel = select(this);
      const hasKids = !!(d.children || d._collapsedChildren);
      const isPage = !!d.data.page;
      const color = isPage ? statusColor(d.data.page.status) : "var(--border-hover)";

      sel.append("circle")
        .attr("r", isPage ? 5 : 4)
        .attr("fill", color)
        .attr("stroke", "var(--bg)").attr("stroke-width", 1.5)
        .style("cursor", isPage ? "pointer" : "default")
        .on("click", () => { if (isPage) onOpenPage(d.data.page.id); });

      const label = sel.append("g").style("cursor", isPage ? "pointer" : "default")
        .on("click", () => { if (isPage) onOpenPage(d.data.page.id); });
      const labelText = d.depth === 0 ? d.data.name : d.data.name;
      const text = label.append("text")
        .attr("x", 11).attr("dy", "0.32em")
        .attr("fill", isPage ? "var(--text)" : "var(--text-dim)")
        .attr("font-size", 12).attr("font-family", "var(--sans)")
        .attr("font-weight", d.depth === 0 ? 650 : 500)
        .text(labelText.length > 26 ? labelText.slice(0, 24) + "…" : labelText);
      text.append("title").text(d.data.page?.title || d.data.path);

      if (d.data.count > 1 && hasKids) {
        sel.append("text").attr("x", 11).attr("y", 13)
          .attr("fill", "var(--text-faint)").attr("font-size", 9.5).attr("font-family", "var(--mono)")
          .text(`${d.data.count} pages`);
      }

      if (hasKids) {
        const btn = sel.append("g")
          .attr("transform", `translate(${Math.min(labelText.length, 24) * 6.2 + 20},0)`)
          .style("cursor", "pointer")
          .on("click", () => toggle(d));
        btn.append("circle").attr("r", 7).attr("fill", "var(--panel)").attr("stroke", "var(--border)");
        btn.append("text").attr("text-anchor", "middle").attr("dy", "0.32em")
          .attr("fill", "var(--text-dim)").attr("font-size", 10).attr("font-family", "var(--mono)")
          .text(d.children ? "–" : "+");
      }
    });

    // zoom/pan only — no drag, no simulation, nothing that can jitter
    const zb = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .filter((event) => !event.button && event.type !== "dblclick")
      .on("zoom", (event) => g.attr("transform", event.transform));
    zoomRef.current = zb;
    svg.call(zb);
    svg.call(zb.transform, zoomIdentity);

    return () => { svg.on(".zoom", null); };
  });

  const zoomBy = (factor: number) => {
    if (!svgRef.current || !zoomRef.current) return;
    select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy as any, factor);
  };
  const resetView = () => {
    if (!svgRef.current || !zoomRef.current) return;
    select(svgRef.current).transition().duration(250).call(zoomRef.current.transform as any, zoomIdentity);
  };

  if (loading) return <div className="empty"><span className="spinner" /></div>;
  if (!raw) return <div className="card empty"><div className="empty-title">No pages to show yet</div></div>;

  return (
    <div className="graph-wrap" ref={containerRef} style={{ height: 560, overflow: "auto" }}>
      <svg ref={svgRef} style={{ display: "block" }} />
      <div className="graph-legend">
        <div style={{ fontWeight: 650, marginBottom: 2 }}>Site structure</div>
        <div className="graph-legend-row"><span className="dot" style={{ background: "var(--accent)" }} /> 2xx / 3xx</div>
        <div className="graph-legend-row"><span className="dot" style={{ background: "var(--warning)" }} /> redirect</div>
        <div className="graph-legend-row"><span className="dot" style={{ background: "var(--error)" }} /> 4xx / 5xx</div>
        <div className="graph-legend-row"><Folder size={11} className="faint" /> <span className="faint">folder (no page itself)</span></div>
      </div>
      <div className="graph-controls">
        <button className="icon-btn" title="Zoom in" onClick={() => zoomBy(1.4)}><Plus size={14} /></button>
        <button className="icon-btn" title="Zoom out" onClick={() => zoomBy(0.7)}><Minus size={14} /></button>
        <button className="icon-btn" title="Reset view" onClick={resetView}><RotateCcw size={14} /></button>
      </div>
      <div className="graph-hint"><Maximize2 size={11} /> scroll to zoom · drag to pan · click +/– to expand a branch · click a page to open it</div>
    </div>
  );
}
