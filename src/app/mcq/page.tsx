import { LogoutControl } from "@/components/logout-control";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export default async function McqPage() {
	const user = await getCurrentUser();

	return (
		<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
			<div className="w-full max-w-lg">
				<Card>
					<CardHeader>
						<CardTitle>MCQ authoring</CardTitle>
						<CardDescription>
							{user
								? `Signed in as ${user.firstName} ${user.lastName}`
								: "Multiple-choice question features are coming in a future sprint."}
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<p className="text-sm text-muted-foreground">
							Quiz Maker will let teachers collaborate on a shared test bank of
							questions. Your session is active, so future MCQ routes can build
							on a signed-in user foundation.
						</p>
						<LogoutControl />
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
