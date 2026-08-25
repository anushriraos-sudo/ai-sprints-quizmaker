import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function Home() {
	return (
		<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
			<div className="w-full max-w-lg">
				<Card>
					<CardHeader>
						<CardTitle>Quiz Maker</CardTitle>
						<CardDescription>
							A collaborative test bank of multiple-choice questions.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<p className="text-sm text-muted-foreground">
							Create an account or sign in to get started. 
							{/* MCQ authoring arrives in a future sprint — this phase focuses on registration and authentication. */}
						</p>
						<div className="flex flex-col gap-2 sm:flex-row">
							<Button render={<Link href="/register" />} nativeButton={false}>
								Create account
							</Button>
							<Button
								variant="outline"
								render={<Link href="/login" />}
								nativeButton={false}
							>
								Sign in
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
