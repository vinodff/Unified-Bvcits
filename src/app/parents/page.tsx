import type { Metadata } from "next";
import PortalPage from "@/components/portal/PortalPage";
import { getPortal } from "@/data/portals";

const portal = getPortal("parents");

export const metadata: Metadata = {
  title: portal.title,
  description: portal.metaDescription,
};

export default function Page() {
  return <PortalPage portal={portal} />;
}
