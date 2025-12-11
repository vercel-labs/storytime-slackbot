import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
	/* config options here */
	experimental: {
		serverMinification: false,
		instrumentationHook: true,
	}
};

export default withWorkflow(nextConfig);
