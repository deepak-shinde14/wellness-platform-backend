-- backend/database/db-schema.sql
CREATE DATABASE IF NOT EXISTS wellness_db;
USE wellness_db;

-- Users table
CREATE TABLE IF NOT EXISTS Users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  email_verified BOOLEAN DEFAULT FALSE,
  reset_password_token VARCHAR(255),
  reset_password_expires DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Goals table
CREATE TABLE IF NOT EXISTS Goals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category ENUM('weight', 'nutrition', 'exercise', 'mindfulness', 'hydration', 'sleep', 'other') NOT NULL,
  target_value DECIMAL(10,2),
  current_value DECIMAL(10,2) DEFAULT 0,
  unit VARCHAR(50),
  target_date DATE,
  status ENUM('active', 'completed', 'abandoned') DEFAULT 'active',
  progress INT DEFAULT 0,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  INDEX idx_user_status (user_id, status),
  INDEX idx_category (category)
);

-- Consultations table
CREATE TABLE IF NOT EXISTS Consultations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  consultation_type ENUM('nutrition', 'fitness', 'mental_health', 'general') DEFAULT 'general',
  preferred_date DATE NOT NULL,
  preferred_time TIME,
  duration INT DEFAULT 60 COMMENT 'Duration in minutes',
  notes TEXT,
  status ENUM('pending', 'confirmed', 'completed', 'cancelled') DEFAULT 'pending',
  reminder_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE SET NULL,
  INDEX idx_status (status),
  INDEX idx_user (user_id)
);

-- Content table
CREATE TABLE IF NOT EXISTS Content (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  excerpt VARCHAR(500),
  content_type ENUM('article', 'video', 'recipe', 'tip', 'workout') NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(100),
  tags JSON,
  author VARCHAR(100),
  read_time INT COMMENT 'Reading time in minutes',
  is_featured BOOLEAN DEFAULT FALSE,
  is_published BOOLEAN DEFAULT TRUE,
  view_count INT DEFAULT 0,
  thumbnail_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FULLTEXT INDEX idx_fulltext (title, excerpt, content)
);

-- User Progress/Activities table
CREATE TABLE IF NOT EXISTS UserProgress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  goal_id INT,
  content_id INT,
  activity_type VARCHAR(100) NOT NULL,
  value DECIMAL(10,2),
  unit VARCHAR(50),
  notes TEXT,
  mood ENUM('great', 'good', 'neutral', 'bad', 'terrible'),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  FOREIGN KEY (goal_id) REFERENCES Goals(id) ON DELETE SET NULL,
  FOREIGN KEY (content_id) REFERENCES Content(id) ON DELETE SET NULL,
  INDEX idx_user_date (user_id, recorded_at),
  INDEX idx_activity (activity_type)
);

-- Bookmarks/User Favorites
CREATE TABLE IF NOT EXISTS Bookmarks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  content_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_bookmark (user_id, content_id),
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  FOREIGN KEY (content_id) REFERENCES Content(id) ON DELETE CASCADE
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS PasswordResets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_token (token),
  INDEX idx_email (email)
);

-- Insert demo user
INSERT IGNORE INTO Users (username, email, password_hash, is_admin) 
VALUES ('demo', 'demo@example.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeLYp7cQ0F8V5qH.V8n7H.5JtJ0v6J3.W', TRUE);

-- Insert sample content
INSERT IGNORE INTO Content (title, slug, excerpt, content_type, content, category, tags, author, read_time, is_featured) VALUES
('5 Healthy Habits for the New Year', '5-healthy-habits-new-year', 'Start your year right with these simple habits', 'article', 'Begin with proper hydration, aim for 30 minutes of daily movement, plan your meals weekly, prioritize 7-8 hours of sleep, and practice mindful eating. These habits form the foundation for lasting health improvements.', 'nutrition', '["habits", "new year", "wellness"]', 'Dr. Sarah Johnson', 5, TRUE),
('Meal Prep Guide for Busy People', 'meal-prep-guide', 'Save time and eat healthy with smart meal prep', 'article', 'Choose one protein source (chicken, tofu, beans), one complex carb (quinoa, brown rice), and two colorful vegetables. Roast everything at once, portion into containers, and add fresh greens when ready to eat.', 'nutrition', '["meal prep", "time saving", "recipes"]', 'Chef Michael Chen', 8, TRUE),
('Mindful Eating Techniques', 'mindful-eating-techniques', 'Learn to connect with your food and body', 'article', '1. Eat without distractions 2. Chew thoroughly 3. Notice flavors and textures 4. Check hunger/fullness cues 5. Express gratitude for your food', 'mindfulness', '["mindfulness", "eating", "awareness"]', 'Dr. Lisa Park', 6, FALSE);

