"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function LogoutControl() {
	const router = useRouter();
	const [submitting, setSubmitting] = useState(false);

	async function handleLogout() {
		setSubmitting(true);

		try {
			await fetch("/api/auth/logout", { method: "POST" });
			router.push("/login");
		} catch {
			setSubmitting(false);
		}
	}

	return (
		<Button
			type="button"
			variant="outline"
			onClick={handleLogout}
			disabled={submitting}
		>
			{submitting ? "Signing out…" : "Log out"}
		</Button>
	);
}
