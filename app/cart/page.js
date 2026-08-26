import { redirect } from 'next/navigation';

export default function CartRedirect() {
  redirect('/admin/cart-signs');
}
