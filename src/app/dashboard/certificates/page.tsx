import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth/server";
import { can } from "@/lib/auth/roles";
import { EmptyState } from "@/components/dashboard/ui";
import { Award } from "@/components/ui/icons";
import { CertificateGenerator } from "./certificate-generator";
import { BatchHistory } from "./batch-history";
import { listBatches } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Certificate Generator | BVCITS",
  robots: { index: false, follow: false },
};

export default async function CertificatesPage() {
  const user = await getSessionUser();
  if (!user) return null;

  if (!can(user.role, "certificates.generate")) {
    return (
      <EmptyState
        icon={<Award className="h-8 w-8" />}
        text="The certificate generator is available for admin, management, and faculty accounts."
      />
    );
  }

  const batches = await listBatches();

  return (
    <div className="space-y-8">
      <CertificateGenerator />
      {batches.length > 0 && <BatchHistory batches={batches} />}
    </div>
  );
}
