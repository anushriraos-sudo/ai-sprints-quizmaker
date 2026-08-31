import { McqList } from "@/components/mcq-list";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export default async function McqPage() {
	const user = await getCurrentUser();

	return (
		<div className="min-h-svh w-full p-6 md:p-10">
			<div className="mx-auto w-full max-w-6xl">
				<McqList
					userDisplayName={
						user ? `${user.firstName} ${user.lastName}` : "Teacher"
					}
				/>
			</div>
		</div>
	);
}
