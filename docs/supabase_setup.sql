CREATE TABLE tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  description text NOT NULL,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE ecosystem_status (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  component text NOT NULL,
  status text,
  progress integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO ecosystem_status (component, status, progress) VALUES
('Aureon Network', 'в разработке', 31),
('VERITAS Metaverse', 'концепция', 23),
('AI SUS', 'запуск', 38),
('NFT система', 'готова', 40);
