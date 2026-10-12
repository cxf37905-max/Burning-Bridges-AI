import { Metadata as brandMetadata } from '../../messages/en.json';

export const studioBrand = {
  ...brandMetadata,
  url: 'https://burningbridgesai.cc',
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
      'Burning Bridges AI is a photo-to-video generator for making your own version of the viral Burning Bridges trend. Upload one photo, choose a template, and the AI creates a party-style video with your subject in the lead.',
  },
  {
    question: 'How do I make a Burning Bridges AI video?',
    answer:
      'Upload a clear photo, choose a Burning Bridges template, confirm your generation settings, and start the video. You do not need to film the routine, edit the scene, or write a complicated AI video prompt.',
  },
  {
    question: 'What does “Burning Bridges AI” mean?',
    answer:
      'The phrase usually refers to AI-made versions of the party-video trend associated with Drake’s “Burning Bridges,” where a different person, pet or character becomes the lead subject in the scene.',
  },
  {
    question: 'Is Burning Bridges AI related to Drake?',
    answer:
      'The online trend is inspired by the video style associated with Drake’s “Burning Bridges.” BurningBridgesAI.cc is an independent AI tool and is not affiliated with, sponsored by, or endorsed by Drake or his rights holders.',
  },
  {
    question: 'What song is used for the Burning Bridges AI trend?',
    answer:
      'The trend is associated with Drake’s “Burning Bridges.” When publishing your video on a social platform, use audio you have the right to use or an official sound provided by that platform.',
  },
  {
    question: 'Do I need to write a prompt?',
    answer:
      'No. The Burning Bridges scene and motion are already set up in the template, so you mainly choose a photo and a template before generating.',
  },
  {
    question: 'What photo works best for Burning Bridges AI?',
    answer:
      'Use one person or pet with a clearly visible face, good lighting, and a head-to-waist or full-body composition. Avoid blurry group photos, heavy filters, hidden faces and extreme angles.',
  },
  {
    question: 'Can I make a Burning Bridges AI video with my pet?',
    answer:
      'Yes. A clear photo of one pet can be used as the subject reference. Images where the head and body are easy to distinguish usually give the AI more useful visual information.',
  },
  {
    question: 'Why does my face look different in the generated video?',
    answer:
      'AI video can change facial details as the subject moves, turns, or becomes partially obscured. A sharp, well-lit, front-facing source photo usually gives the model a stronger identity reference.',
  },
  {
    question: 'How long is the Burning Bridges AI video?',
    answer:
      'The current Burning Bridges video shown in the generator is 20 seconds long.',
  },
  {
    question: 'Is Burning Bridges AI free?',
    answer:
      'Video generation uses credits. The generator displays the required credit amount before you create the video.',
  },
  {
    question: 'What quality is the generated video?',
    answer: 'The current Burning Bridges generator offers HD 720p output.',
  },
  {
    question: 'Can I use a photo of another person?',
    answer:
      'Only use photos of people who have agreed to appear in the generated video. The output is AI-generated content and should not be presented as real footage of that person.',
  },
  {
    question: 'Is BurningBridgesAI.cc an official Drake website?',
    answer:
      'No. BurningBridgesAI.cc is an independent AI video tool. It is not affiliated with, sponsored by, or endorsed by Drake, his label, or the rights holders of the original song or video.',
  },
] as const;
