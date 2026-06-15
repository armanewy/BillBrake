import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BillBrake Scan",
    short_name: "BillBrake",
    description:
      "Upload payment artifacts, review detected payments, and see which paycheck they hit.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f2",
    theme_color: "#141711",
  };
}
