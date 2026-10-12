import { UpdateAvatarCard } from '@/components/settings/profile/update-avatar-card';
import { UpdateNameCard } from '@/components/settings/profile/update-name-card';
import { getSession } from '@/lib/server';
import { redirect } from 'next/navigation';

export default async function ProfilePage() {
  const session = await getSession();
  if (!session?.user?.id) redirect('/auth/login');
  return (
    <div className="flex flex-col gap-8">
      <UpdateNameCard initialName={session.user.name} />
      <UpdateAvatarCard initialImage={session.user.image} />
    </div>
  );
}
