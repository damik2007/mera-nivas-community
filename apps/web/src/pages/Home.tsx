import { useAuth } from "../lib/auth";
import { GuardScanner } from "./GuardScanner";
import { ResidentHome } from "./ResidentHome";
import { AdminOverview } from "./AdminOverview";

export function Home() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === "SECURITY") return <GuardScanner />;
  if (user.role === "SOCIETY_ADMIN" || user.role === "SUPER_ADMIN") return <AdminOverview />;
  return <ResidentHome />;
}
