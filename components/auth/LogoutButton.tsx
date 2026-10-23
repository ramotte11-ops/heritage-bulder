import { signOut } from "@/app/auth/actions";
import { LogoutSubmit } from "./LogoutSubmit";
import styles from "./LogoutButton.module.css";

/** Plain form bound to the signOut Server Action; its button shows the action in progress. */
export function LogoutButton() {
  return (
    <form action={signOut}>
      <LogoutSubmit className={styles.button} />
    </form>
  );
}
