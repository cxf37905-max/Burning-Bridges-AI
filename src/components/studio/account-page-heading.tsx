export function AccountPageHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="bb-account-heading">
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}
