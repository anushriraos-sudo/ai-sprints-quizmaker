import { logoutUser } from "@/lib/api/auth-handlers";
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(logoutUser(), { status: 200 });
}
