export default function ParticipantPage({
  params,
}: {
  params: { league_id: string; magic_token: string };
}) {
  return (
    <div>
      Bracket for {params.magic_token} in league {params.league_id} — coming
      soon
    </div>
  );
}
