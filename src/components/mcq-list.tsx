"use client";

import { EllipsisVerticalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LogoutControl } from "@/components/logout-control";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { McqErrorResponse } from "@/lib/types/mcq-api";
import type { McqSummary } from "@/lib/types/mcq";

type McqListProps = {
	userDisplayName: string;
};

type LoadState = "loading" | "ready" | "error";

export function McqList({ userDisplayName }: McqListProps) {
	const router = useRouter();
	const [loadState, setLoadState] = useState<LoadState>("loading");
	const [errorMessage, setErrorMessage] = useState<string | undefined>();
	const [mcqs, setMcqs] = useState<McqSummary[]>([]);
	const [deleteTarget, setDeleteTarget] = useState<McqSummary | null>(null);
	const [deleting, setDeleting] = useState(false);

	useEffect(() => {
		let cancelled = false;

		async function loadMcqs() {
			try {
				const response = await fetch("/api/mcqs");
				const data = (await response.json()) as {
					mcqs?: McqSummary[];
				} & McqErrorResponse;

				if (cancelled) {
					return;
				}

				if (!response.ok) {
					setLoadState("error");
					setErrorMessage(
						data.formError ?? "Something went wrong. Please try again.",
					);
					return;
				}

				setMcqs(data.mcqs ?? []);
				setLoadState("ready");
			} catch {
				if (!cancelled) {
					setLoadState("error");
					setErrorMessage("Something went wrong. Please try again.");
				}
			}
		}

		void loadMcqs();

		return () => {
			cancelled = true;
		};
	}, []);

	async function handleConfirmDelete() {
		if (!deleteTarget) {
			return;
		}

		setDeleting(true);

		try {
			const response = await fetch(`/api/mcqs/${deleteTarget.id}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				const data = (await response.json()) as McqErrorResponse;
				setLoadState("error");
				setErrorMessage(data.formError ?? "Something went wrong. Please try again.");
				setDeleteTarget(null);
				return;
			}

			setMcqs((current) => current.filter((mcq) => mcq.id !== deleteTarget.id));
			setDeleteTarget(null);
		} catch {
			setLoadState("error");
			setErrorMessage("Something went wrong. Please try again.");
			setDeleteTarget(null);
		} finally {
			setDeleting(false);
		}
	}

	return (
		<div className="flex w-full flex-col gap-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">MCQ bank</h1>
					<p className="text-sm text-muted-foreground">
						Signed in as {userDisplayName}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button type="button" onClick={() => router.push("/mcq/new")}>
						Create MCQ
					</Button>
					<LogoutControl />
				</div>
			</div>

			{loadState === "loading" ? (
				<p className="text-sm text-muted-foreground">Loading questions…</p>
			) : null}

			{loadState === "error" && errorMessage ? (
				<p className="text-sm text-destructive" role="alert">
					{errorMessage}
				</p>
			) : null}

			{loadState === "ready" && mcqs.length === 0 ? (
				<div className="rounded-xl border border-dashed p-8 text-center">
					<p className="text-sm text-muted-foreground">
						No multiple-choice questions yet.
					</p>
					<a
						href="/mcq/new"
						className="mt-4 inline-flex text-sm font-medium text-foreground underline underline-offset-4"
						onClick={(event) => {
							event.preventDefault();
							router.push("/mcq/new");
						}}
					>
						Create your first MCQ
					</a>
				</div>
			) : null}

			{loadState === "ready" && mcqs.length > 0 ? (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Question</TableHead>
							<TableHead>Created</TableHead>
							<TableHead>Updated</TableHead>
							<TableHead className="w-[72px]">
								<span className="sr-only">Actions</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{mcqs.map((mcq) => (
							<TableRow key={mcq.id}>
								<TableCell className="font-medium">{mcq.name}</TableCell>
								<TableCell className="max-w-md truncate">{mcq.question}</TableCell>
								<TableCell>{mcq.createdAt}</TableCell>
								<TableCell>{mcq.updatedAt}</TableCell>
								<TableCell>
									<DropdownMenu>
										<DropdownMenuTrigger
											render={
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label={`Actions for ${mcq.name}`}
												/>
											}
										>
											<EllipsisVerticalIcon />
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem
												onClick={() => router.push(`/mcq/${mcq.id}/edit`)}
											>
												Edit
											</DropdownMenuItem>
											<DropdownMenuItem
												onClick={() => router.push(`/mcq/${mcq.id}/preview`)}
											>
												Preview
											</DropdownMenuItem>
											<DropdownMenuItem
												variant="destructive"
												onClick={() => setDeleteTarget(mcq)}
											>
												Delete
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			) : null}

			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => {
					if (!open && !deleting) {
						setDeleteTarget(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{deleteTarget ? `Delete "${deleteTarget.name}"?` : "Delete MCQ?"}
						</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently removes the question, its choices, and related
							attempts. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deleting}
							onClick={() => void handleConfirmDelete()}
						>
							{deleting ? "Deleting…" : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
