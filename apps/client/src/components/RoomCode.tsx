type RoomCodeProps = {
  code: string;
};

export function RoomCode({ code }: RoomCodeProps) {
  return (
    <div className="room-code" aria-label={`Room code ${code}`}>
      <span className="eyebrow">Room code</span>
      <strong>{code}</strong>
      <span className="room-code__hint">Mock code</span>
    </div>
  );
}
