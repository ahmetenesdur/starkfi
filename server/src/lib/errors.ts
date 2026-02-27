export class ApiError extends Error {
	constructor(
		public readonly statusCode: number,
		message: string,
		public readonly code?: string
	) {
		super(message);
		this.name = "ApiError";
	}
}

export function errorResponse(error: unknown) {
	if (error instanceof ApiError) {
		return {
			status: error.statusCode,
			body: {
				error: {
					code: error.code ?? "UNKNOWN_ERROR",
					message: error.message,
				},
			},
		};
	}

	// Log internal errors for observability
	if (error instanceof Error) {
		console.error("[INTERNAL_ERROR]", error.message, error.stack);
	} else {
		console.error("[INTERNAL_ERROR]", error);
	}

	const message =
		process.env.NODE_ENV === "production"
			? "Internal server error"
			: error instanceof Error
				? error.message
				: String(error);

	return {
		status: 500,
		body: {
			error: {
				code: "INTERNAL_ERROR",
				message,
			},
		},
	};
}
