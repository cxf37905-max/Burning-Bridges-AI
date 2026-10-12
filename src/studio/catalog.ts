export const studioBrand = {
  name: 'Burning Bridges AI',
  url: 'https://burningbridgesai.cc',
  title: 'Burning Bridges AI Video Generator — Your Photo, Your Party',
  description:
    'Make a Burning Bridges AI video from one photo. Choose your party scene, preview your photo, and create your take on the Drake-inspired trend. One-time video packs.',
} as const;

export const videoPacks = [
  {
    id: 'single',
    name: 'Single',
    videos: 1,
    cents: 990,
    note: 'Make your entrance.',
  },
  {
    id: 'trio',
    name: 'Starter',
    videos: 3,
    cents: 1990,
    note: 'Try a different side of you.',
  },
  {
    id: 'creator',
    name: 'Creator',
    videos: 9,
    cents: 4990,
    note: 'Keep the group chat busy.',
  },
] as const;

export type PackId = (typeof videoPacks)[number]['id'];
export const videoCreditCost = 100;

export function findVideoPack(id: string) {
  return videoPacks.find((pack) => pack.id === id);
}

export function formatPrice(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export const partyScenes = [
  {
    id: 'chandelier',
    name: 'Chandelier banquet (original)',
    subtitle: 'Warm lights. Main-character energy.',
    poster: '/studio/reference/burning-bridges-ai-video.jpg',
    posterPosition: 'center 30%',
    video: '/studio/reference/burning-bridges-ai-video.mp4',
  },
  {
    id: 'after-hours',
    name: 'Hotel suite after-party',
    subtitle: 'A softer light. A late-night mood.',
    poster: '/studio/reference/burning-bridges-after-party.jpg',
    posterPosition: '72% center',
    video: '/studio/reference/burning-bridges-after-party.mp4',
  },
] as const;
export type PartySceneId = (typeof partyScenes)[number]['id'];

export const studioFaqs = [
  {
    question: 'What is Burning Bridges AI?',
    answer:
      'Burning Bridges AI is a photo-to-video trend: a portrait becomes the lead in a party performance inspired by the Drake clip. This independent studio is built around that one creative task.',
  },
  {
    question: 'How do I make a Burning Bridges AI video?',
    answer:
      'Choose a clear photo of yourself or an adult who agreed to appear, pick your party scene, and review the video price. Generation opens when the studio is ready. No prompt writing or filming is required.',
  },
  {
    question: 'What does “where she at” mean?',
    answer:
      'In this trend it refers to the playful hand-above-the-eyes gesture, as if looking across the room. People use the phrase to find the party clip and AI versions of it.',
  },
  {
    question: 'Is Burning Bridges AI free?',
    answer:
      'Browsing scenes and checking your photo are free. Finished videos will use one-time packs, starting at $9.90 for one video. Purchases are closed while generation is being connected.',
  },
  {
    question: 'Can I make a Drake AI video of myself?',
    answer:
      'The idea is to make yourself the lead in an inspired party scene. Use your own photo or permission from another adult. This service is independent and is not affiliated with Drake or his label.',
  },
  {
    question: 'Which photos work best?',
    answer:
      'Use one person with their head and upper body visible, even lighting, and no sunglasses. JPG, PNG and WebP are supported, up to 20 MB, with at least 341 pixels on each side.',
  },
  {
    question: 'Does my video include the Burning Bridges song?',
    answer:
      'Yes. The finished 20-second Burning Bridges AI video includes the original template soundtrack, timed to the performance. Both party scenes include music.',
  },
  {
    question: 'Is this a subscription?',
    answer:
      'No. Each credit pack is a one-time purchase, with no automatic renewal. Every Burning Bridges AI video costs 100 credits and includes the same video quality.',
  },
  {
    question: 'Will the AI keep my face exactly the same?',
    answer:
      'AI video can change facial features, hands, clothes and background details. A clear, well-lit photo helps, but exact identity preservation is not guaranteed. The reference player is labeled so you can distinguish the trend from studio results.',
  },
] as const;
