import { redirect } from 'next/navigation';

// Dashboard route group handles all pages now.
// This file cannot be deleted (mount permissions) so we redirect to /chat
// to avoid conflict with (dashboard)/page.tsx which also maps to /.
export default function RootPage() {
  redirect('/chat');
}
