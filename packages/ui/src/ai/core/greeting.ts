export function getGreeting(user: { name?: string | null } | null) {
  // Get current hour to determine time of day
  const hour = new Date().getHours()
  let timeOfDay: 'morning' | 'afternoon' | 'evening'

  if (hour >= 5 && hour < 12) {
    timeOfDay = 'morning'
  } else if (hour >= 12 && hour < 18) {
    timeOfDay = 'afternoon'
  } else {
    timeOfDay = 'evening'
  }

  // Create greeting templates for each time of day with optional [name] placeholder
  const greetings = {
    morning: [
      `Good morning[name]! How can I help you today?`,
      `Morning[name]! What can I assist you with?`,
      `Rise and shine[name]! What's on your mind this morning?`,
      `Good morning[name]! How can I make your day easier?`,
    ],
    afternoon: [
      `Good afternoon[name]! What can I help you with today?`,
      `Hello[name]! How can I assist you this afternoon?`,
      `What can I help you accomplish today[name]?`,
      `Afternoon[name]! What questions do you have?`,
    ],
    evening: [
      `Good evening[name]! How can I assist you?`,
      `Evening[name]! What's on your mind?`,
      `How can I help you tonight[name]?`,
      `What can I do for you this evening[name]?`,
    ],
  }

  // Get a random greeting based on time of day
  const randomIndex = Math.floor(Math.random() * greetings[timeOfDay].length)
  let greeting = greetings[timeOfDay][randomIndex] ?? ''

  // Only attempt to personalize if user exists and has a name
  if (user?.name) {
    // Extract just the first name by splitting on spaces and taking the first part
    const firstName = user.name.split(' ')[0]

    // Decide whether to use a personalized greeting
    const usePersonalized = Math.random() > 0.5

    // Apply personalization only if the random choice says to use it
    if (usePersonalized) {
      // Replace the placeholder with a comma and the user's first name
      greeting = greeting.replace('[name]', `, ${firstName}`)
    }
  }

  // Remove any remaining placeholders (for non-personalized greetings)
  greeting = greeting.replace('[name]', '')

  return greeting
}
