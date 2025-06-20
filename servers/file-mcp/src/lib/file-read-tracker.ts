import { resolve } from "node:path";

/**
 * Centralized file read tracking for safety checks in Write and Edit tools
 */
class FileReadTracker {
  private readFiles = new Set<string>();

  /**
   * Mark a file as read, allowing subsequent write/edit operations
   */
  markFileAsRead(filePath: string): void {
    this.readFiles.add(resolve(filePath));
  }

  /**
   * Check if a file has been read
   */
  isFileRead(filePath: string): boolean {
    return this.readFiles.has(resolve(filePath));
  }

  /**
   * Clear all read tracking (useful for cleanup)
   */
  clearReadTracking(): void {
    this.readFiles.clear();
  }

  /**
   * Get all tracked files (for debugging)
   */
  getTrackedFiles(): string[] {
    return Array.from(this.readFiles);
  }
}

// Export singleton instance
export const fileReadTracker = new FileReadTracker();
