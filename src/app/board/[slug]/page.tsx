import type { Metadata } from "next";
import { getAllPeople, getArchiveStats } from "@/lib/queries";
import { BoardWorkspace } from "@/components/board/board-workspace";

export const metadata: Metadata = {
  title: "Case Board — Investigate The Files",
  description:
    "Search evidence, map connections, and build your investigation board.",
};

export default async function BoardPage() {
  const [people, stats] = await Promise.all([
    getAllPeople(),
    getArchiveStats(),
  ]);

  return (
    <BoardWorkspace
      archiveTitle="Case Board"
      archiveSubtitle={`${stats.emailCount.toLocaleString()} emails · ${stats.documentCount.toLocaleString()} docs · ${stats.photoCount.toLocaleString()} photos · ${stats.personCount} persons`}
      people={people}
      stats={stats}
    />
  );
}
