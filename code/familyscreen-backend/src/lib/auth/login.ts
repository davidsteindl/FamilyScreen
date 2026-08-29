"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export async function login(
  formData: FormData,
) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return "E-Mail or Password is wrong.";
      }

      return "Login  failed.";
    }

    throw error;
  }
}