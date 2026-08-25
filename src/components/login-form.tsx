"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AuthErrorResponse } from "@/lib/types/auth-api";

export function LoginForm({
	className,
	...props
}: React.ComponentProps<"div">) {
	const router = useRouter();
	const [submitting, setSubmitting] = useState(false);
	const [formError, setFormError] = useState<string | undefined>();
	const [fieldErrors, setFieldErrors] = useState<
		AuthErrorResponse["fieldErrors"]
	>({});

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setFormError(undefined);
		setFieldErrors({});

		const formData = new FormData(event.currentTarget);

		try {
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: formData.get("email"),
					password: formData.get("password"),
				}),
			});

			if (response.ok) {
				router.push("/mcq");
				return;
			}

			const data = (await response.json()) as AuthErrorResponse;
			setFieldErrors(data.fieldErrors ?? {});
			setFormError(data.formError);
		} catch {
			setFormError("Something went wrong. Please try again.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className={cn("flex flex-col gap-6", className)} {...props}>
			<Card>
				<CardHeader>
					<CardTitle>Login to your account</CardTitle>
					<CardDescription>
						Enter your email below to login to your account
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit}>
						<FieldGroup>
							{formError ? (
								<FieldError className="mb-1">{formError}</FieldError>
							) : null}
							<Field data-invalid={!!fieldErrors?.email}>
								<FieldLabel htmlFor="email">Email</FieldLabel>
								<Input
									id="email"
									name="email"
									type="email"
									autoComplete="email"
									placeholder="m@example.com"
									required
									disabled={submitting}
									aria-invalid={!!fieldErrors?.email}
								/>
								<FieldError>{fieldErrors?.email?.[0]}</FieldError>
							</Field>
							<Field data-invalid={!!fieldErrors?.password}>
								<FieldLabel htmlFor="password">Password</FieldLabel>
								<Input
									id="password"
									name="password"
									type="password"
									autoComplete="current-password"
									required
									disabled={submitting}
									aria-invalid={!!fieldErrors?.password}
								/>
								<FieldError>{fieldErrors?.password?.[0]}</FieldError>
							</Field>
							<Field>
								<Button type="submit" disabled={submitting} className="w-full">
									{submitting ? "Signing in…" : "Login"}
								</Button>
								<FieldDescription className="text-center">
									Don&apos;t have an account?{" "}
									<Link href="/register">Sign up</Link>
								</FieldDescription>
							</Field>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
