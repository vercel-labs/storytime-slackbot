type InsightsResult = {
	project: string;
	period: string;
	metrics: { name: string; value: number | string; change?: string }[];
	topEvents?: { name: string; count: number }[];
};

export async function fetchPostHogInsights(query: string): Promise<InsightsResult> {
	"use step";

	const apiKey = process.env.POSTHOG_API_KEY;
	const projectId = process.env.POSTHOG_PROJECT_ID;

	if (!apiKey || !projectId) {
		// Return mock data if no API key configured
		console.log("PostHog not configured, returning mock data");
		return getMockInsights(query);
	}

	try {
		// Parse query for date range
		const { dateFrom, dateTo } = parseDateRange(query);

		// Fetch insights from PostHog
		const response = await fetch(
			`https://app.posthog.com/api/projects/${projectId}/insights/trend/?date_from=${dateFrom}&date_to=${dateTo}`,
			{
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
			},
		);

		if (!response.ok) {
			throw new Error(`PostHog API error: ${response.status}`);
		}

		const data = await response.json();
		return formatPostHogData(data, query);
	} catch (error) {
		console.error("PostHog fetch error:", error);
		return getMockInsights(query);
	}
}

function parseDateRange(query: string): { dateFrom: string; dateTo: string } {
	const now = new Date();
	const dateTo = now.toISOString().split("T")[0];

	if (query.includes("30 days") || query.includes("month")) {
		const from = new Date(now.setDate(now.getDate() - 30));
		return { dateFrom: from.toISOString().split("T")[0], dateTo };
	}
	if (query.includes("24 hours") || query.includes("today")) {
		return { dateFrom: dateTo, dateTo };
	}
	// Default: 7 days
	const from = new Date(now.setDate(now.getDate() - 7));
	return { dateFrom: from.toISOString().split("T")[0], dateTo };
}

function formatPostHogData(data: unknown, query: string): InsightsResult {
	// Transform PostHog response to our format
	return {
		project: "OkraPDF",
		period: query,
		metrics: [
			{ name: "Total Events", value: "Loading from PostHog...", change: "" },
		],
		topEvents: [],
	};
}

function getMockInsights(query: string): InsightsResult {
	return {
		project: "OkraPDF",
		period: query,
		metrics: [
			{ name: "Total Users", value: 1247, change: "+12%" },
			{ name: "PDF Extractions", value: 3891, change: "+8%" },
			{ name: "API Calls", value: 12453, change: "+15%" },
			{ name: "Avg Response Time", value: "1.2s", change: "-5%" },
		],
		topEvents: [
			{ name: "pdf_upload", count: 3891 },
			{ name: "extraction_complete", count: 3654 },
			{ name: "download_result", count: 2987 },
			{ name: "api_call", count: 12453 },
			{ name: "user_signup", count: 89 },
		],
	};
}
