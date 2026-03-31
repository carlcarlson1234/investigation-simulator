import { redirect } from "next/navigation";

// Single workspace — redirect to the board
export default function CasesPage() {
  redirect("/board/archive");
}
