// Copyright 2026 agent-media contributors. Apache-2.0 license.

export interface RecommendedModel {
  model: string;
  slug: string;
  why: string;
  credits: string;
  cliCommand: string;
}

export interface WorkflowStep {
  step: number;
  title: string;
  command: string;
  description: string;
}

export interface UseCase {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  intro: string;
  recommendedModels: RecommendedModel[];
  steps: WorkflowStep[];
  costBreakdown: string;
  relatedUseCases: string[];
  videoUrl?: string;
}

export const useCaseData: Record<string, UseCase> = {
  'tiktok-reels-content': {
    slug: 'tiktok-reels-content',
    title: 'TikTok & Reels Content',
    videoUrl: 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/af6707bb-2c95-4ecc-8e52-9dcdb4ddb37a/ugc-final.mp4',
    metaTitle:
      'Generate TikTok & Instagram Reels Videos with AI — agent-media CLI',
    metaDescription:
      'Create viral short-form video content for TikTok and Instagram Reels using AI video models. Generate 9:16 portrait videos from your terminal with one command.',
    keywords: [
      'TikTok video generator',
      'Instagram Reels AI',
      'short-form video AI',
      'AI video for TikTok',
      '9:16 video generator',
      'vertical video AI',
      'agent-media CLI',
      'batch video generation',
    ],
    intro:
      'Short-form vertical video dominates social media. TikTok, Instagram Reels, and YouTube Shorts all require 9:16 portrait content that grabs attention in the first second. With agent-media CLI, you can generate scroll-stopping short-form videos directly from your terminal — no video editor, no stock footage library, no browser tabs. Pick a model, write a prompt, and publish.',
    recommendedModels: [
      {
        model: 'Talking Head',
        slug: 'video',
        why: 'Best-in-class human motion and facial expressions — essential for creator-style content that feels authentic on social feeds.',
        credits: '200-400 per video',
        cliCommand:
          'agent-media generate video -p "Young woman reacting to surprising news, selfie POV" --aspect-ratio 9:16 --sync',
      },
      {
        model: 'Full Production',
        slug: 'video',
        why: 'Strong prompt adherence and consistent motion make it reliable for batch-producing social content at scale.',
        credits: '200-400 per video',
        cliCommand:
          'agent-media generate video -p "Street food vendor flipping a crepe, close-up, vibrant colors" --aspect-ratio 9:16 --sync',
      },
    ],
    steps: [
      {
        step: 1,
        title: 'Install and authenticate',
        command: 'npm install -g agent-media-cli && agent-media login',
        description:
          'Install the CLI globally and log in with your agent-media account. This takes under 30 seconds and gives you access to all capabilities.',
      },
      {
        step: 2,
        title: 'Generate a portrait video',
        command:
          'agent-media generate video -p "Person unboxing a mystery package, excited reaction" --aspect-ratio 9:16 --sync',
        description:
          'Use the --aspect-ratio 9:16 flag to produce vertical video sized for TikTok and Reels. The --sync flag waits for the result and downloads it automatically.',
      },
      {
        step: 3,
        title: 'Batch-generate variations',
        command:
          'for i in 1 2 3; do agent-media generate video -p "Prompt variation $i" --aspect-ratio 9:16; done',
        description:
          'Loop through multiple prompts in your shell to produce several variations at once. Drop the --sync flag to queue jobs in parallel, then check results with agent-media jobs list.',
      },
      {
        step: 4,
        title: 'Review and download',
        command: 'agent-media jobs list',
        description:
          'List all recent jobs to see their status and download URLs. Pick the best takes and upload directly to TikTok or Instagram from your device.',
      },
    ],
    costBreakdown:
      'A single 5-second TikTok clip costs 150 credits. On the Creator plan ($39/month for 3,900 credits), you can generate roughly 26 short-form videos per month — or about 13 at 10-second duration (300 credits each). If you need higher volume, the Pro Plus plan ($129/month for 12,900 credits) covers ~43 videos monthly. Pay-as-you-go packs (3,900 credits for $39) are also available.',
    relatedUseCases: [
      'talking-head-ugc',
      'youtube-shorts-pipeline',
      'marketing-graphics',
    ],
  },

  'product-demo-videos': {
    slug: 'product-demo-videos',
    title: 'Product Demo Videos',
    videoUrl: 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/e229b1d5-b14b-46e8-84ee-0dc5c7d7bb49/ugc-final.mp4',
    metaTitle:
      'Create AI Product Demo Videos from Your Terminal — agent-media CLI',
    metaDescription:
      'Generate polished product demo videos and animated walkthroughs using AI video models. Showcase products without a film crew — just a prompt and a command.',
    keywords: [
      'product demo video AI',
      'AI product animation',
      'product video generator',
      'explainer video AI',
      'product showcase video',
      'AI walkthrough video',
      'agent-media CLI',
      'e-commerce video',
    ],
    intro:
      'Product demo videos convert browsers into buyers, but hiring a video production team for every SKU is expensive and slow. AI video generation lets you create animated product showcases, explainer clips, and walkthrough videos from a text description. With agent-media CLI, you describe your product scene, choose a pipeline optimized for object detail and smooth motion, and get a polished clip back in minutes.',
    recommendedModels: [
      {
        model: 'Product Demo',
        slug: 'video',
        why: 'Excellent prompt adherence for detailed product descriptions — renders textures, labels, and physical details accurately.',
        credits: '200-400 per video',
        cliCommand:
          'agent-media generate video -p "White wireless earbuds rotating on a marble surface, studio lighting, product showcase" --sync',
      },
      {
        model: 'Cinematic B-roll',
        slug: 'video',
        why: 'Smooth motion interpolation and creative camera angles make product reveals feel cinematic and premium.',
        credits: '250-600 per video',
        cliCommand:
          'agent-media generate video -p "Smartphone floating and rotating to reveal all sides, minimalist white background" -d 8 --sync',
      },
    ],
    steps: [
      {
        step: 1,
        title: 'Prepare your prompt',
        command:
          'agent-media generate video -p "Glass perfume bottle on a reflective black surface, soft studio lights, slow 360-degree rotation" --sync',
        description:
          'Write a detailed prompt that specifies the product, surface, lighting, and camera movement. Be specific about materials and angles for the best results.',
      },
      {
        step: 2,
        title: 'Try an image-to-video approach',
        command:
          'agent-media generate video -p "Animate this product with a slow zoom-out reveal" --input product-photo.jpg --sync',
        description:
          'If you already have a product photo, use the --input flag to animate it. This keeps your product looking exactly right while adding motion and depth to the scene.',
      },
      {
        step: 3,
        title: 'Generate a longer walkthrough',
        command:
          'agent-media generate video -p "Laptop opening on a desk, screen lighting up, hands typing, modern office" -d 12 --sync',
        description:
          'Use the -d 12 flag for up to 12 seconds of footage. Longer clips work well for product walkthroughs that show multiple features or use cases in a single take.',
      },
      {
        step: 4,
        title: 'Check credit usage',
        command: 'agent-media credits',
        description:
          'Monitor your credit balance after each generation. Product demo videos typically use 200-600 credits depending on duration, so tracking spend helps you plan your content budget.',
      },
    ],
    costBreakdown:
      'Product demos start at 150 credits for a 5-second clip and 300 for a 10-second video at 1080p. The Creator plan ($39/month for 3,900 credits) covers about 13 product demo videos per month at 10s each. For e-commerce teams generating videos for an entire catalog, the Pro Plus plan ($129/month for 12,900 credits) offers the best per-credit value at ~43 videos/month.',
    relatedUseCases: [
      'marketing-graphics',
      'cinematic-b-roll',
      'talking-head-ugc',
    ],
  },

  'talking-head-ugc': {
    slug: 'talking-head-ugc',
    title: 'Talking Head & UGC Videos',
    videoUrl: 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/20e91823-0603-48bb-af6f-5b14a6689f19/ugc-final.mp4',
    metaTitle:
      'Generate AI Talking Head & UGC Videos — agent-media CLI',
    metaDescription:
      'Create complete UGC videos from a script using the agent-media UGC pipeline. Talking heads, B-roll, voiceover, and optional animated captions — one command from the terminal.',
    keywords: [
      'AI talking head video',
      'UGC video generator',
      'AI vlogger',
      'script to video AI',
      'creator video AI',
      'talking head AI generator',
      'agent-media CLI',
      'AI avatar video',
      'AI voiceover',
      'animated subtitles',
    ],
    intro:
      'Transform any script into a complete UGC video in one command. The pipeline handles scene splitting, AI talking heads, AI B-roll generation, TTS voiceover, crossfade assembly, background music, and end-screen CTA automatically — and adds animated captions on request.',
    recommendedModels: [
      {
        model: 'UGC Pipeline',
        slug: 'ugc',
        why: 'Full pipeline (AI talking heads + AI B-roll + AI voiceover). Handles scene splitting, crossfade assembly, animated subtitles, background music, and end-screen CTA automatically.',
        credits: '500–1,500 per 5–15s video',
        cliCommand:
          'agent-media ugc "Ever wonder why top founders wake up at 5am?" --sync',
      },
    ],
    steps: [
      {
        step: 1,
        title: 'Generate from script',
        command:
          'agent-media ugc "Ever wonder why top founders wake up at 5am?" --sync',
        description:
          'Provide your script and the UGC pipeline splits it into scenes, generates TTS voiceover, creates AI talking head clips and AI B-roll, then assembles everything with crossfades, background music, and an end-screen CTA — with animated captions added on request.',
      },
      {
        step: 2,
        title: 'Add a face photo for talking heads',
        command:
          'agent-media ugc "script..." --face-url ./photo.png --sync',
        description:
          'Provide a face photo to drive talking head scenes. The pipeline auto-detects the best TTS voice to match the face and uses AI lip-sync for realistic results.',
      },
      {
        step: 3,
        title: 'Customize style and music',
        command:
          'agent-media ugc "script..." --style hormozi --music chill --sync',
        description:
          'Choose from subtitle styles (hormozi, minimal, bold, karaoke, clean), set the background music genre, and customize aspect ratio and duration to match your brand.',
      },
      {
        step: 4,
        title: 'Multi-scene with custom B-roll images',
        command:
          'agent-media ugc "script..." --broll-images "url1,url2" --sync',
        description:
          'Supply your own images as B-roll sources. The pipeline animates them using AI video generation and weaves them into the assembled video between talking head scenes.',
      },
      {
        step: 5,
        title: 'Dub into another language',
        command:
          'agent-media ugc "script..." --dub-language es --sync',
        description:
          'Generate the full UGC video in a different language. The pipeline translates the script, synthesises a matching TTS voice, and re-assembles the video with localized subtitles.',
      },
      {
        step: 6,
        title: 'Create a reusable persona',
        command:
          'agent-media persona create --name brand --voice ./sample.mp3 --face ./photo.png',
        description:
          'Save a persona with a specific voice and face for consistent UGC across videos. Reference it with --persona brand in future ugc commands to maintain a unified creator identity.',
      },
    ],
    costBreakdown:
      'A 5-second UGC video costs 150 credits, covering AI talking heads, voiceover, and full assembly (captions optional). A 10s video is 300 credits, 15s is 450 credits. The Creator plan ($39/month for 3,900 credits) lets you produce ~13 videos at 10s per month. For higher volume, Pro Plus ($129/month for 12,900 credits) covers ~43 videos monthly.',
    relatedUseCases: [
      'tiktok-reels-content',
      'youtube-shorts-pipeline',
      'product-demo-videos',
    ],
  },

  'cinematic-b-roll': {
    slug: 'cinematic-b-roll',
    title: 'Cinematic B-Roll Footage',
    videoUrl: 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/b9309250-df91-4e07-90cc-301e275c7930/ugc-final.mp4',
    metaTitle:
      'Generate AI Cinematic B-Roll & Aerial Footage — agent-media CLI',
    metaDescription:
      'Create stunning cinematic B-roll, drone shots, and landscape footage using AI video models. Professional establishing shots from a single terminal command.',
    keywords: [
      'AI B-roll generator',
      'cinematic AI footage',
      'AI drone shot',
      'AI aerial footage',
      'establishing shot AI',
      'stock footage AI alternative',
      'agent-media CLI',
      'landscape video AI',
    ],
    intro:
      'Cinematic B-roll — sweeping drone shots, moody cityscapes, time-lapses of clouds rolling over mountains — is the backbone of professional video production. Licensing stock footage is expensive and generic. Shooting original B-roll requires drones, permits, and travel. AI video generation gives you custom cinematic footage tailored to your exact scene, without leaving your desk. agent-media CLI puts the most capable cinematic models at your fingertips.',
    recommendedModels: [
      {
        model: 'Cinematic B-roll',
        slug: 'video',
        why: 'Best temporal coherence and natural camera movements — produces footage that genuinely looks like it came from a professional drone or gimbal.',
        credits: '300-500 per video',
        cliCommand:
          'agent-media generate video -p "Aerial drone shot over a foggy pine forest at dawn, golden light breaking through" --sync',
      },
      {
        model: 'Extended Clip',
        slug: 'video',
        why: 'Handles abstract and artistic scenes beautifully, with longer duration options for extended establishing shots.',
        credits: '250-600 per video',
        cliCommand:
          'agent-media generate video -p "Slow dolly shot through an abandoned warehouse, dust particles in shafts of light" -d 12 --sync',
      },
    ],
    steps: [
      {
        step: 1,
        title: 'Generate a landscape establishing shot',
        command:
          'agent-media generate video -p "Sweeping aerial shot of coastal cliffs at sunset, waves crashing below, golden hour lighting" -d 8 --sync',
        description:
          'Our cinematic pipeline produces the most photorealistic outdoor footage. Specify camera movement (aerial, dolly, tracking) and lighting conditions for results that match real-world cinematography.',
      },
      {
        step: 2,
        title: 'Create an urban time-lapse',
        command:
          'agent-media generate video -p "Time-lapse of city skyline transitioning from day to night, lights turning on" --sync',
        description:
          'Time-lapse prompts work especially well with our cinematic model. It handles gradual lighting changes and moving elements like clouds and traffic with strong temporal coherence.',
      },
      {
        step: 3,
        title: 'Generate a moody interior B-roll',
        command:
          'agent-media generate video -p "Camera slowly panning across a dimly lit jazz bar, candles flickering, empty glasses on tables" -d 12 --sync',
        description:
          'Our extended pipeline excels at atmospheric interior scenes. Use the 12-second duration for longer tracking shots that establish mood before cutting to your main content.',
      },
      {
        step: 4,
        title: 'Build a B-roll library',
        command:
          'agent-media generate video -p "Close-up of rain drops hitting a puddle in slow motion" --sync',
        description:
          'Generate a collection of detail shots, textures, and atmospheric clips. These small moments — rain on glass, steam rising, leaves falling — fill the gaps in any edit and add production value.',
      },
    ],
    costBreakdown:
      'B-roll clips cost 150 credits for a 5-second shot and 300 for a 10-second clip. The Creator plan ($39/month for 3,900 credits) produces roughly 13-26 B-roll clips per month. Filmmakers and agencies cutting together full projects will benefit from Pro Plus ($129/month for 12,900 credits), which covers 43-86 clips monthly.',
    relatedUseCases: [
      'product-demo-videos',
      'youtube-shorts-pipeline',
      'youtube-shorts-pipeline',
    ],
  },

  'marketing-graphics': {
    slug: 'marketing-graphics',
    title: 'Marketing Graphics & Social Ads',
    videoUrl: 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/20e91823-0603-48bb-af6f-5b14a6689f19/ugc-final.mp4',
    metaTitle:
      'Generate AI Marketing Graphics & Ad Creatives — agent-media CLI',
    metaDescription:
      'Create social media graphics, ad creatives, and marketing images using AI image models. Generate on-brand visuals with accurate text rendering from the CLI.',
    keywords: [
      'AI marketing graphics',
      'social media image AI',
      'ad creative generator AI',
      'AI graphic design',
      'marketing image AI',
      'AI ad creatives',
      'agent-media CLI',
      'text on image AI',
    ],
    intro:
      'Marketing teams need a constant stream of fresh visuals — social posts, ad creatives, email headers, blog illustrations. Designing each one from scratch in Figma or Canva takes time. AI image generation lets you go from brief to finished graphic in seconds. agent-media CLI gives you access to models with accurate text rendering and consistent style, so your marketing output stays on-brand without a designer in the loop for every asset.',
    recommendedModels: [
      {
        model: 'Photo-quality Image',
        slug: 'image',
        why: 'Best-in-class text rendering — logos, signs, headlines, and labels appear correctly in generated images, which is critical for marketing assets.',
        credits: '50-100 per image',
        cliCommand:
          'agent-media generate image -p "Instagram story graphic: bold text SUMMER SALE 50% OFF on a tropical beach background" --aspect-ratio 9:16 --sync',
      },
      {
        model: 'Artistic Image',
        slug: 'image',
        why: 'Distinctive artistic style that stands out in crowded feeds — ideal for scroll-stopping ad creatives and eye-catching social posts.',
        credits: '50-100 per image',
        cliCommand:
          'agent-media generate image -p "Vibrant flat illustration of a coffee shop scene for a cafe brand social post" --sync',
      },
    ],
    steps: [
      {
        step: 1,
        title: 'Generate a social media graphic',
        command:
          'agent-media generate image -p "Clean promotional banner: NEW COLLECTION NOW LIVE, modern fashion photography style, white background" --aspect-ratio 16:9 --sync',
        description:
          'Our photo-quality pipeline handles text in images accurately, making it ideal for banners and ads where headlines and CTAs need to be legible. Specify the aspect ratio to match your target platform.',
      },
      {
        step: 2,
        title: 'Create ad creative variations',
        command:
          'agent-media generate image -p "Product ad: sleek smartwatch on a dark surface with text STARTING AT $299" --sync',
        description:
          'Generate multiple ad creative variations by tweaking the prompt — change colors, backgrounds, or copy. Each image costs 50-100 credits, making rapid iteration affordable.',
      },
      {
        step: 3,
        title: 'Design an illustrated graphic',
        command:
          'agent-media generate image -p "Isometric illustration of a coworking space for a tech startup blog header" --sync',
        description:
          'Use our artistic model for illustrated graphics that break away from photorealism. Its distinctive visual style works well for blog headers, newsletter graphics, and brand content.',
      },
      {
        step: 4,
        title: 'Batch-produce for a campaign',
        command:
          'for size in "16:9" "1:1" "9:16"; do agent-media generate image -p "Holiday sale banner, festive red and gold theme, SAVE 30%" --aspect-ratio $size; done',
        description:
          'Generate the same creative in multiple sizes for different platforms. A single loop produces landscape (Facebook), square (Instagram feed), and portrait (Stories) variants from one prompt.',
      },
    ],
    costBreakdown:
      'Image generation is the most cost-effective use case. AI images cost 50-100 credits each. On the Creator plan ($39/month for 3,900 credits), you can produce 39-78 marketing images per month. Extra credit packs (3,900 credits for $39) are available if you need more.',
    relatedUseCases: [
      'youtube-shorts-pipeline',
      'product-demo-videos',
      'tiktok-reels-content',
    ],
  },

  'youtube-shorts-pipeline': {
    slug: 'youtube-shorts-pipeline',
    title: 'YouTube Shorts Automation Pipeline',
    videoUrl: 'https://pub-16e2ed8f6be84691845e91436920ce0a.r2.dev/generation-outputs/120eaf6f-d2af-4f66-83e8-e62ec826de01/2478ee27-fbe7-4c75-b552-6e355114ac64/ugc-final.mp4',
    metaTitle:
      'Automate YouTube Shorts with AI Video Generation — agent-media CLI',
    metaDescription:
      'Build an automated pipeline for generating YouTube Shorts using AI video models. Script batch generation, schedule jobs, and integrate with CI/CD — all from the terminal.',
    keywords: [
      'YouTube Shorts automation',
      'AI video pipeline',
      'automated video generation',
      'batch video generation CLI',
      'CI/CD video pipeline',
      'YouTube Shorts AI',
      'agent-media CLI',
      'video generation script',
    ],
    intro:
      'Publishing YouTube Shorts consistently is a volume game — the algorithm rewards frequent uploads. Manually creating each Short is a bottleneck. agent-media CLI is a terminal tool, which means it integrates directly into shell scripts, cron jobs, and CI/CD pipelines. You can build an automated pipeline that generates, reviews, and queues Shorts without manual intervention for every video.',
    recommendedModels: [
      {
        model: 'Quick Generation',
        slug: 'video',
        why: 'Fast generation with strong human-subject results — the workhorse for automated pipelines that need consistent quality across hundreds of outputs.',
        credits: '200-400 per video',
        cliCommand:
          'agent-media generate video -p "Person demonstrating a life hack, POV style" --aspect-ratio 9:16 --sync',
      },
      {
        model: 'Full Production',
        slug: 'video',
        why: 'High prompt adherence ensures that scripted prompts produce predictable results — important when generation runs unattended in a pipeline.',
        credits: '200-400 per video',
        cliCommand:
          'agent-media generate video -p "Satisfying slow-motion pour of honey into a glass" --aspect-ratio 9:16 --sync',
      },
      {
        model: 'Cinematic B-roll',
        slug: 'video',
        why: 'Best choice when your pipeline includes nature, travel, or scenic content — its cinematic quality requires less post-generation filtering.',
        credits: '300-500 per video',
        cliCommand:
          'agent-media generate video -p "Underwater coral reef, tropical fish, crystal clear water" --aspect-ratio 9:16 --sync',
      },
    ],
    steps: [
      {
        step: 1,
        title: 'Create a prompt list',
        command:
          'cat prompts.txt\n# Line 1: "Satisfying paint mixing in slow motion"\n# Line 2: "Puppy seeing snow for the first time"\n# Line 3: "Time-lapse of flowers blooming"',
        description:
          'Maintain a text file with one prompt per line. This becomes the input for your batch generation script. You can curate prompts weekly and let the pipeline handle the rest.',
      },
      {
        step: 2,
        title: 'Run a batch generation script',
        command:
          'while IFS= read -r prompt; do agent-media generate video -p "$prompt" --aspect-ratio 9:16; done < prompts.txt',
        description:
          'A simple shell loop reads each prompt and fires off a generation job. Without --sync, jobs queue in parallel on the server, dramatically reducing total wait time for large batches.',
      },
      {
        step: 3,
        title: 'Monitor job completion',
        command: 'agent-media jobs list',
        description:
          'Check the status of all queued jobs. The CLI shows job IDs, status, and download links. You can filter by status or pipe the output to other tools for automated monitoring.',
      },
      {
        step: 4,
        title: 'Schedule with cron',
        command:
          '# crontab -e\n0 6 * * 1 /usr/local/bin/agent-media generate video -p "Monday motivation quote animation" --aspect-ratio 9:16',
        description:
          'Add agent-media commands to your crontab to generate content on a schedule. Combine with a rotating prompt list to publish fresh Shorts every day without any manual steps.',
      },
    ],
    costBreakdown:
      'Pipeline economics depend on volume. At 150 credits per 5-second Short, a Pro Plus plan ($129/month for 12,900 credits) produces 86 videos per month — nearly three per day. For lower volume, the Creator plan ($39/month for 3,900 credits) covers 26 Shorts monthly. Mixing in cheaper image generation for thumbnails (50 credits each) barely dents the budget.',
    relatedUseCases: [
      'tiktok-reels-content',
      'talking-head-ugc',
      'talking-head-ugc',
    ],
  },

};

export const allUseCaseSlugs = Object.keys(useCaseData);
