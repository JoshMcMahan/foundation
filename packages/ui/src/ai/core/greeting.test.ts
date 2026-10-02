import { afterEach, describe, expect, it } from 'vitest'
import { getGreeting } from './greeting'

// Fake timers pin the clock to the given hour today.
const mockDate = (hour: number) => {
  const now = new Date()
  now.setHours(hour, 0, 0, 0)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  return () => {
    vi.useRealTimers()
  }
}

// Mock Math.random for consistent testing results
const mockRandom = (returnValue: number) => {
  const originalRandom = Math.random
  Math.random = () => returnValue
  return () => {
    Math.random = originalRandom
  }
}

describe('getGreeting', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Time of day greetings', () => {
    it('should return a morning greeting when hour is between 5 and 11', () => {
      const restoreDate = mockDate(8) // 8 AM
      const restoreRandom = mockRandom(0.2) // Less than 0.5, won't personalize

      const greeting = getGreeting(null)

      // Check that it's one of the morning greetings
      expect(greeting).toContain('morning')

      restoreDate()
      restoreRandom()
    })

    it('should return an afternoon greeting when hour is between 12 and 17', () => {
      const restoreDate = mockDate(14) // 2 PM
      const restoreRandom = mockRandom(0.2) // Less than 0.5, won't personalize

      const greeting = getGreeting(null)

      // Check that it's one of the afternoon greetings
      expect(greeting).toContain('afternoon')

      restoreDate()
      restoreRandom()
    })

    it('should return an evening greeting when hour is 18 or later', () => {
      const restoreDate = mockDate(20) // 8 PM
      const restoreRandom = mockRandom(0.2) // Less than 0.5, won't personalize

      const greeting = getGreeting(null)

      // Check that it's one of the evening greetings
      expect(greeting).toContain('evening')

      restoreDate()
      restoreRandom()
    })

    it('should return an evening greeting when hour is before 5', () => {
      const restoreDate = mockDate(3) // 3 AM
      const restoreRandom = mockRandom(0.2) // Less than 0.5, won't personalize

      const greeting = getGreeting(null)

      // Check that it's one of the evening greetings
      expect(greeting).toContain('evening')

      restoreDate()
      restoreRandom()
    })
  })

  describe('Personalization', () => {
    it('should not personalize greeting when user is null', () => {
      const restoreDate = mockDate(14) // 2 PM
      const restoreRandom = mockRandom(0.7) // More than 0.5, would personalize if user exists

      const greeting = getGreeting(null)

      // Greeting shouldn't contain a comma which would indicate personalization
      expect(greeting).not.toContain(',')

      restoreDate()
      restoreRandom()
    })

    it('should not personalize greeting when user has no name', () => {
      const restoreDate = mockDate(14) // 2 PM
      const restoreRandom = mockRandom(0.7) // More than 0.5, would personalize if user has name

      const greeting = getGreeting({ name: '' })

      // Greeting shouldn't contain a comma which would indicate personalization
      expect(greeting).not.toContain(',')

      restoreDate()
      restoreRandom()
    })

    it('should not personalize greeting when Math.random returns <= 0.5', () => {
      const restoreDate = mockDate(14) // 2 PM
      const restoreRandom = mockRandom(0.5) // Exactly 0.5, shouldn't personalize

      const greeting = getGreeting({ name: 'John' })

      // Greeting shouldn't contain the user's name
      expect(greeting).not.toContain('John')

      restoreDate()
      restoreRandom()
    })

    it('should personalize greeting when user exists and Math.random returns > 0.5', () => {
      const restoreDate = mockDate(14) // 2 PM
      const restoreRandom = mockRandom(0.6) // More than 0.5, should personalize

      const greeting = getGreeting({ name: 'John' })

      // Greeting should contain the user's name
      expect(greeting).toContain('John')

      restoreDate()
      restoreRandom()
    })

    it('should use only the first name when a full name is provided', () => {
      const restoreDate = mockDate(14) // 2 PM
      const restoreRandom = mockRandom(0.6) // More than 0.5, should personalize

      const greeting = getGreeting({ name: 'John Smith' })

      // Greeting should contain only the first name
      expect(greeting).toContain('John')
      // Greeting should not contain the last name
      expect(greeting).not.toContain('Smith')

      restoreDate()
      restoreRandom()
    })

    it('should use only the first name when a name with multiple spaces is provided', () => {
      const restoreDate = mockDate(14) // 2 PM
      const restoreRandom = mockRandom(0.6) // More than 0.5, should personalize

      const greeting = getGreeting({ name: 'John Middle Smith Jr.' })

      // Greeting should contain only the first name
      expect(greeting).toContain('John')
      // Greeting should not contain other parts of the name
      expect(greeting).not.toContain('Middle')
      expect(greeting).not.toContain('Smith')
      expect(greeting).not.toContain('Jr.')

      restoreDate()
      restoreRandom()
    })

    it('should work correctly when the name has no spaces', () => {
      const restoreDate = mockDate(14) // 2 PM
      const restoreRandom = mockRandom(0.6) // More than 0.5, should personalize

      const greeting = getGreeting({ name: 'JohnDoe' })

      // Greeting should contain the whole name since there are no spaces
      expect(greeting).toContain('JohnDoe')

      restoreDate()
      restoreRandom()
    })
  })

  describe('Random selection', () => {
    it('should use different greetings based on Math.random result', () => {
      const restoreDate = mockDate(8) // 8 AM

      // Force different random indexes for greeting selection
      const restoreRandom1 = mockRandom(0.1) // First greeting
      const greeting1 = getGreeting(null)
      restoreRandom1()

      const restoreRandom2 = mockRandom(0.9) // Last greeting
      const greeting2 = getGreeting(null)
      restoreRandom2()

      // Should select different greetings
      expect(greeting1).not.toEqual(greeting2)

      restoreDate()
    })
  })
})
