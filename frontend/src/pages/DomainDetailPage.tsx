import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";

/** /domains/:id used to be the crawl-history page. It's now the "Crawls" tab of the site workspace;
 *  this keeps old links and bookmarks working. */
export default function DomainDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  useEffect(() => {
    api.domains.get(Number(id)).then((d: any) => nav(`/sites/${d.host}?tab=crawls`, { replace: true })).catch(() => nav("/domains", { replace: true }));
  }, [id]);
  return <div className="empty"><span className="spinner" /></div>;
}
