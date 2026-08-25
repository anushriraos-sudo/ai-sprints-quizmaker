import { LogoutControl } from "@/components/logout-control";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function McqPage() {
	return (
		<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
			<div className="w-full max-w-lg">
				<Card>
					<CardHeader>
						<CardTitle>MCQ authoring</CardTitle>
						<CardDescription>
							Multiple-choice question features are coming in a future sprint.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<p className="text-sm text-muted-foreground">
							Quiz Maker will let users collaborate on a shared test bank of
							questions. For now, registration and login are in place so
							collaboration can build on a real user foundation.
						</p>
						<LogoutControl />
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
