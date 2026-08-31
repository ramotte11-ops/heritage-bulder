import { signOut } from "@/app/auth/actions";
import styles from "./LogoutButton.module.css";

/** Plain form bound to the signOut Server Action — no client JS needed. */
export function LogoutButton() {
  return (
    <form action={signOut}>
      <button type="submit" className={styles.button}>
        Se déconnecter
      </button>
    </form>
  );
}
