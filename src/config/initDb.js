// src/config/initDb.js
const mysql = require('mysql2');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

// Create connection (not pool for initialization)
const connection = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pawdeal',
    multipleStatements: true,
    charset: 'utf8mb4'
});

const createTables = async () => {
    try {
        connection.connect();
        console.log('✅ Connected to MySQL database');

        // Disable foreign key checks and strict mode temporarily
        const dropTablesSQL = `
            SET FOREIGN_KEY_CHECKS = 0;
            SET SQL_MODE = '';
            
            DROP TABLE IF EXISTS refresh_tokens;
            DROP TABLE IF EXISTS audit_logs;
            DROP TABLE IF EXISTS seller_analytics_daily;
            DROP TABLE IF EXISTS analytics_events;
            DROP TABLE IF EXISTS subscription_benefits;
            DROP TABLE IF EXISTS subscriptions;
            DROP TABLE IF EXISTS event_attendees;
            DROP TABLE IF EXISTS events;
            DROP TABLE IF EXISTS guides;
            DROP TABLE IF EXISTS blog_posts;
            DROP TABLE IF EXISTS comment_likes;
            DROP TABLE IF EXISTS comments;
            DROP TABLE IF EXISTS messages;
            DROP TABLE IF EXISTS conversation_participants;
            DROP TABLE IF EXISTS conversations;
            DROP TABLE IF EXISTS favorites;
            DROP TABLE IF EXISTS order_items;
            DROP TABLE IF EXISTS orders;
            DROP TABLE IF EXISTS cart_items;
            DROP TABLE IF EXISTS cart;
            DROP TABLE IF EXISTS product_reviews;
            DROP TABLE IF EXISTS product_images;
            DROP TABLE IF EXISTS products;
            DROP TABLE IF EXISTS pet_health_records;
            DROP TABLE IF EXISTS pet_images;
            DROP TABLE IF EXISTS pets;
            DROP TABLE IF EXISTS breeds;
            DROP TABLE IF EXISTS sellers;
            DROP TABLE IF EXISTS user_profiles;
            DROP TABLE IF EXISTS users;
            
            SET FOREIGN_KEY_CHECKS = 1;
        `;

        // Execute drop tables
        connection.query(dropTablesSQL, (err) => {
            if (err) {
                console.error('❌ Error dropping tables:', err.message);
            } else {
                console.log('✅ Existing tables dropped');
            }
        });

        // Create tables SQL (without the final indexes)
        const createTablesSQL = `
            -- 1. USERS TABLE
            CREATE TABLE users (
                id CHAR(36) PRIMARY KEY,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                first_name VARCHAR(100) NOT NULL,
                last_name VARCHAR(100) NOT NULL,
                phone VARCHAR(32),
                role VARCHAR(16) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
                account_status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (account_status IN ('active', 'suspended', 'pending')),
                email_verified BOOLEAN NOT NULL DEFAULT FALSE,
                email_verification_token VARCHAR(255),
                reset_password_token VARCHAR(255),
                reset_password_expires DATETIME,
                profile_image_url TEXT,
                refresh_token TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                last_login TIMESTAMP NULL,
                INDEX idx_email (email),
                INDEX idx_status (account_status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 2. USER PROFILES TABLE
            CREATE TABLE user_profiles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id CHAR(36) UNIQUE NOT NULL,
                bio TEXT,
                city VARCHAR(100),
                state VARCHAR(100),
                country VARCHAR(100),
                address_line1 VARCHAR(255),
                address_line2 VARCHAR(255),
                postal_code VARCHAR(32),
                is_seller BOOLEAN NOT NULL DEFAULT FALSE,
                seller_since TIMESTAMP NULL,
                business_name VARCHAR(255),
                business_license VARCHAR(255),
                tax_id VARCHAR(64),
                payment_info TEXT,
                notification_preferences JSON,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_seller (is_seller)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 3. SELLERS TABLE
            CREATE TABLE sellers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id CHAR(36) UNIQUE NOT NULL,
                seller_rating DECIMAL(3,2) DEFAULT 0.00,
                total_reviews INT DEFAULT 0,
                total_sales INT DEFAULT 0,
                verification_status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
                verified_at TIMESTAMP NULL,
                commission_rate DECIMAL(5,2),
                payout_method JSON,
                featured_seller BOOLEAN NOT NULL DEFAULT FALSE,
                store_name VARCHAR(255),
                store_description TEXT,
                store_logo_url TEXT,
                store_banner_url TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_verified (verification_status),
                INDEX idx_featured (featured_seller)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 4. BREEDS TABLE
            CREATE TABLE breeds (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                category VARCHAR(24) NOT NULL CHECK (category IN ('dog','cat','fish','bird','small_animal','reptile')),
                description TEXT,
                temperament TEXT,
                care_requirements TEXT,
                health_considerations TEXT,
                average_size VARCHAR(64),
                average_weight VARCHAR(64),
                life_expectancy VARCHAR(32),
                image_url TEXT,
                popular BOOLEAN DEFAULT FALSE,
                FULLTEXT INDEX ft_breed_name (name),
                INDEX idx_category (category)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 5. PETS TABLE
            CREATE TABLE pets (
                id CHAR(36) PRIMARY KEY,
                seller_id CHAR(36),
                name VARCHAR(100) NOT NULL,
                breed_id INT,
                category VARCHAR(24) NOT NULL CHECK (category IN ('dog','cat','fish','bird','small_animal','reptile')),
                age_years INT CHECK (age_years >= 0),
                age_months INT CHECK (age_months >= 0 AND age_months < 12),
                gender VARCHAR(8) NOT NULL CHECK (gender IN ('male','female','unknown')),
                price DECIMAL(12,2) NOT NULL,
                currency VARCHAR(8) NOT NULL DEFAULT 'USD',
                description TEXT,
                health_status TEXT,
                vaccinated BOOLEAN DEFAULT FALSE,
                dewormed BOOLEAN DEFAULT FALSE,
                neutered BOOLEAN DEFAULT FALSE,
                microchipped BOOLEAN DEFAULT FALSE,
                registration_papers BOOLEAN DEFAULT FALSE,
                color VARCHAR(64),
                weight_kg DECIMAL(5,2),
                city VARCHAR(100),
                state VARCHAR(100),
                country VARCHAR(100),
                status VARCHAR(16) NOT NULL DEFAULT 'available' CHECK (status IN ('available','pending','sold','reserved','unavailable')),
                view_count INT DEFAULT 0,
                favorite_count INT DEFAULT 0,
                featured BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NULL,
                deleted_at TIMESTAMP NULL,
                FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (breed_id) REFERENCES breeds(id) ON DELETE SET NULL,
                FULLTEXT INDEX ft_pet_name_desc (name, description),
                INDEX idx_category_status (category, status),
                INDEX idx_seller (seller_id),
                INDEX idx_price (price),
                INDEX idx_featured (featured),
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 6. PET IMAGES TABLE
            CREATE TABLE pet_images (
                id INT AUTO_INCREMENT PRIMARY KEY,
                pet_id CHAR(36) NOT NULL,
                image_url TEXT NOT NULL,
                is_primary BOOLEAN NOT NULL DEFAULT FALSE,
                sort_order INT DEFAULT 0,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
                INDEX idx_pet (pet_id),
                INDEX idx_primary (is_primary)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 7. PET HEALTH RECORDS TABLE
            CREATE TABLE pet_health_records (
                id INT AUTO_INCREMENT PRIMARY KEY,
                pet_id CHAR(36) NOT NULL,
                record_type VARCHAR(32) NOT NULL CHECK (record_type IN ('vaccination','vet_check','medical_history')),
                record_date DATE,
                description TEXT,
                document_url TEXT,
                vet_name VARCHAR(255),
                verified BOOLEAN NOT NULL DEFAULT FALSE,
                FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
                INDEX idx_pet (pet_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 8. PRODUCTS TABLE
            CREATE TABLE products (
                id CHAR(36) PRIMARY KEY,
                seller_id CHAR(36),
                name VARCHAR(255) NOT NULL,
                category VARCHAR(32) NOT NULL CHECK (category IN ('food','toys','beds','collars','grooming','health','travel','apparel')),
                subcategory VARCHAR(100),
                pet_type JSON NOT NULL,
                description TEXT,
                price DECIMAL(12,2) NOT NULL,
                sale_price DECIMAL(12,2),
                currency VARCHAR(8) NOT NULL DEFAULT 'USD',
                stock_quantity INT NOT NULL DEFAULT 0,
                sku VARCHAR(64) UNIQUE NOT NULL,
                brand VARCHAR(128),
                weight_kg DECIMAL(6,3),
                dimensions JSON,
                materials TEXT,
                care_instructions TEXT,
                status VARCHAR(18) NOT NULL CHECK (status IN ('active','out_of_stock','discontinued')),
                view_count INT DEFAULT 0,
                purchase_count INT DEFAULT 0,
                rating_avg DECIMAL(3,2) DEFAULT 0.00,
                rating_count INT DEFAULT 0,
                featured BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                deleted_at TIMESTAMP NULL,
                FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE SET NULL,
                FULLTEXT INDEX ft_product_name_desc (name, description),
                INDEX idx_category (category),
                INDEX idx_seller (seller_id),
                INDEX idx_price (price),
                INDEX idx_rating (rating_avg),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 9. PRODUCT IMAGES TABLE
            CREATE TABLE product_images (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id CHAR(36) NOT NULL,
                image_url TEXT NOT NULL,
                is_primary BOOLEAN DEFAULT FALSE,
                sort_order INT DEFAULT 0,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                INDEX idx_product (product_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 10. PRODUCT REVIEWS TABLE
            CREATE TABLE product_reviews (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id CHAR(36) NOT NULL,
                user_id CHAR(36) NOT NULL,
                rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
                review_text TEXT,
                helpful_count INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL,
                verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_user_product (user_id, product_id),
                INDEX idx_product (product_id),
                INDEX idx_rating (rating)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 11. CART TABLE
            CREATE TABLE cart (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id CHAR(36) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 12. CART ITEMS TABLE
            CREATE TABLE cart_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cart_id INT NOT NULL,
                product_id CHAR(36) NOT NULL,
                quantity INT NOT NULL CHECK (quantity >= 1),
                price_at_add DECIMAL(12,2) NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cart_id) REFERENCES cart(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                UNIQUE KEY unique_cart_product (cart_id, product_id),
                INDEX idx_cart (cart_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 13. ORDERS TABLE
            CREATE TABLE orders (
                id CHAR(36) PRIMARY KEY,
                order_number VARCHAR(32) NOT NULL UNIQUE,
                buyer_id CHAR(36),
                order_type VARCHAR(16) NOT NULL CHECK (order_type IN ('pet','product','mixed')),
                subtotal DECIMAL(12,2) NOT NULL,
                tax DECIMAL(12,2) DEFAULT 0.00,
                shipping_cost DECIMAL(12,2) DEFAULT 0.00,
                discount_amount DECIMAL(12,2) DEFAULT 0.00,
                total_amount DECIMAL(12,2) NOT NULL,
                currency VARCHAR(8) NOT NULL,
                status VARCHAR(24) NOT NULL CHECK (status IN ('pending','payment_received','processing','shipped','delivered','cancelled','refunded')),
                payment_status VARCHAR(18) NOT NULL CHECK (payment_status IN ('pending','paid','failed','refunded')),
                payment_method VARCHAR(18) NOT NULL CHECK (payment_method IN ('credit_card','paypal','bank_transfer')),
                payment_id VARCHAR(64),
                shipping_address JSON,
                billing_address JSON,
                buyer_notes TEXT,
                seller_notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                completed_at TIMESTAMP NULL,
                deleted_at TIMESTAMP NULL,
                FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE SET NULL,
                INDEX idx_buyer (buyer_id),
                INDEX idx_status (status),
                INDEX idx_created (created_at),
                INDEX idx_order_number (order_number)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 14. ORDER ITEMS TABLE
            CREATE TABLE order_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id CHAR(36) NOT NULL,
                item_type VARCHAR(8) NOT NULL CHECK (item_type IN ('pet','product')),
                item_id CHAR(36) NOT NULL,
                quantity INT NOT NULL DEFAULT 1,
                unit_price DECIMAL(12,2) NOT NULL,
                total_price DECIMAL(12,2) NOT NULL,
                seller_id CHAR(36),
                status VARCHAR(24),
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE SET NULL,
                INDEX idx_order (order_id),
                INDEX idx_seller (seller_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 15. FAVORITES TABLE
            CREATE TABLE favorites (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id CHAR(36) NOT NULL,
                item_type VARCHAR(8) NOT NULL CHECK (item_type IN ('pet','product')),
                item_id CHAR(36) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_favorite (user_id, item_type, item_id),
                INDEX idx_user (user_id),
                INDEX idx_item (item_type, item_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 16. CONVERSATIONS TABLE
            CREATE TABLE conversations (
                id CHAR(36) PRIMARY KEY,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                last_message_at TIMESTAMP NULL,
                related_pet_id CHAR(36),
                related_product_id CHAR(36),
                status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','blocked')),
                FOREIGN KEY (related_pet_id) REFERENCES pets(id) ON DELETE SET NULL,
                FOREIGN KEY (related_product_id) REFERENCES products(id) ON DELETE SET NULL,
                INDEX idx_last_message (last_message_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 17. CONVERSATION PARTICIPANTS TABLE
            CREATE TABLE conversation_participants (
                id INT AUTO_INCREMENT PRIMARY KEY,
                conversation_id CHAR(36) NOT NULL,
                user_id CHAR(36) NOT NULL,
                last_read_at TIMESTAMP NULL,
                is_muted BOOLEAN DEFAULT FALSE,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_participant (conversation_id, user_id),
                INDEX idx_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 18. MESSAGES TABLE
            CREATE TABLE messages (
                id CHAR(36) PRIMARY KEY,
                conversation_id CHAR(36) NOT NULL,
                sender_id CHAR(36),
                receiver_id CHAR(36),
                message_content TEXT NOT NULL,
                is_read BOOLEAN NOT NULL DEFAULT FALSE,
                read_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE SET NULL,
                INDEX idx_conversation (conversation_id, created_at),
                INDEX idx_receiver_unread (receiver_id, is_read)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 19. COMMENTS TABLE
            CREATE TABLE comments (
                id CHAR(36) PRIMARY KEY,
                user_id CHAR(36),
                comment_type VARCHAR(16) NOT NULL CHECK (comment_type IN ('blog','guide','breed','pet')),
                target_id CHAR(36) NOT NULL,
                parent_comment_id CHAR(36),
                content TEXT NOT NULL,
                like_count INT DEFAULT 0,
                status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden','reported')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE,
                INDEX idx_target (comment_type, target_id, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 20. COMMENT LIKES TABLE
            CREATE TABLE comment_likes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                comment_id CHAR(36) NOT NULL,
                user_id CHAR(36) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_like (comment_id, user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 21. BLOG POSTS TABLE
            CREATE TABLE blog_posts (
                id CHAR(36) PRIMARY KEY,
                author_id CHAR(36),
                title VARCHAR(255) NOT NULL,
                slug VARCHAR(255) UNIQUE NOT NULL,
                excerpt TEXT,
                content TEXT,
                featured_image_url TEXT,
                category VARCHAR(20) NOT NULL CHECK (category IN ('care','training','health','news','stories')),
                tags JSON,
                status VARCHAR(16) NOT NULL CHECK (status IN ('draft','published','archived')),
                published_at TIMESTAMP NULL,
                view_count INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL,
                FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
                FULLTEXT INDEX ft_blog_title_content (title, content),
                INDEX idx_status_published (status, published_at),
                INDEX idx_slug (slug)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 22. GUIDES TABLE
            CREATE TABLE guides (
                id CHAR(36) PRIMARY KEY,
                author_id CHAR(36),
                title VARCHAR(255) NOT NULL,
                slug VARCHAR(255) UNIQUE NOT NULL,
                guide_type VARCHAR(16) NOT NULL CHECK (guide_type IN ('breed','care','training','health','buying')),
                breed_id INT,
                content TEXT,
                featured_image_url TEXT,
                difficulty VARCHAR(14) CHECK (difficulty IN ('beginner','intermediate','advanced')),
                estimated_read_time INT,
                status VARCHAR(12) NOT NULL CHECK (status IN ('draft','published')),
                published_at TIMESTAMP NULL,
                view_count INT DEFAULT 0,
                helpful_count INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL,
                FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (breed_id) REFERENCES breeds(id) ON DELETE SET NULL,
                FULLTEXT INDEX ft_guide_title_content (title, content),
                INDEX idx_type (guide_type),
                INDEX idx_slug (slug)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 23. EVENTS TABLE
            CREATE TABLE events (
                id CHAR(36) PRIMARY KEY,
                organizer_id CHAR(36),
                title VARCHAR(255) NOT NULL,
                description TEXT,
                event_type VARCHAR(24) NOT NULL CHECK (event_type IN ('adoption','meetup','workshop','seminar')),
                start_date DATETIME NOT NULL,
                end_date DATETIME NULL,
                city VARCHAR(100),
                state VARCHAR(100),
                country VARCHAR(100),
                address TEXT,
                is_virtual BOOLEAN DEFAULT FALSE,
                virtual_link VARCHAR(255),
                max_attendees INT,
                current_attendees INT DEFAULT 0,
                featured_image_url TEXT,
                status VARCHAR(16) NOT NULL CHECK (status IN ('upcoming','ongoing','completed','cancelled')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL,
                FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE SET NULL,
                INDEX idx_status_dates (status, start_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 24. EVENT ATTENDEES TABLE
            CREATE TABLE event_attendees (
                id INT AUTO_INCREMENT PRIMARY KEY,
                event_id CHAR(36) NOT NULL,
                user_id CHAR(36) NOT NULL,
                registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                attendance_status VARCHAR(12) NOT NULL CHECK (attendance_status IN ('registered','attended','no_show')),
                FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_attendee (event_id, user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 25. SUBSCRIPTIONS TABLE
            CREATE TABLE subscriptions (
                id CHAR(36) PRIMARY KEY,
                user_id CHAR(36) UNIQUE NOT NULL,
                plan_type VARCHAR(16) NOT NULL CHECK (plan_type IN ('basic','pro','premium')),
                billing_cycle VARCHAR(8) NOT NULL CHECK (billing_cycle IN ('monthly','annual')),
                status VARCHAR(16) NOT NULL CHECK (status IN ('active','canceled','expired','trial')),
                price_paid DECIMAL(12,2) NOT NULL,
                currency VARCHAR(8) NOT NULL DEFAULT 'USD',
                start_date DATETIME NOT NULL,
                end_date DATETIME NOT NULL,
                auto_renew BOOLEAN DEFAULT TRUE,
                payment_method_id VARCHAR(64),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL,
                canceled_at TIMESTAMP NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_status (status),
                INDEX idx_end_date (end_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 26. SUBSCRIPTION BENEFITS TABLE
            CREATE TABLE subscription_benefits (
                id INT AUTO_INCREMENT PRIMARY KEY,
                subscription_id CHAR(36) NOT NULL,
                benefit_type VARCHAR(32) NOT NULL CHECK (benefit_type IN ('pet_listing_limit','analytics_access','featured_listing','priority_support')),
                benefit_value VARCHAR(32),
                expires_at TIMESTAMP NULL,
                FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
                INDEX idx_subscription (subscription_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 27. ANALYTICS EVENTS TABLE
            CREATE TABLE analytics_events (
                id CHAR(36) PRIMARY KEY,
                event_type VARCHAR(24) NOT NULL CHECK (event_type IN ('page_view','pet_view','product_view','search','message_sent','favorite_added')),
                user_id CHAR(36),
                session_id VARCHAR(64),
                target_type VARCHAR(24) CHECK (target_type IN ('pet','product','breed','guide','blog')),
                target_id CHAR(36),
                metadata JSON,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ip_address VARCHAR(64),
                user_agent TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
                INDEX idx_event_type (event_type, timestamp),
                INDEX idx_user (user_id),
                INDEX idx_target (target_type, target_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 28. SELLER ANALYTICS DAILY TABLE
            CREATE TABLE seller_analytics_daily (
                id INT AUTO_INCREMENT PRIMARY KEY,
                seller_id CHAR(36) NOT NULL,
                date DATE NOT NULL,
                profile_views INT DEFAULT 0,
                pet_views INT DEFAULT 0,
                message_count INT DEFAULT 0,
                favorite_count INT DEFAULT 0,
                inquiry_count INT DEFAULT 0,
                conversion_rate DECIMAL(6,4) DEFAULT 0.0000,
                revenue DECIMAL(12,2) DEFAULT 0.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_seller_date (seller_id, date),
                INDEX idx_date (date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 29. AUDIT LOGS TABLE
            CREATE TABLE audit_logs (
                id CHAR(36) PRIMARY KEY,
                user_id CHAR(36),
                action VARCHAR(128) NOT NULL,
                entity_type VARCHAR(64) NOT NULL,
                entity_id CHAR(36),
                old_values JSON,
                new_values JSON,
                ip_address VARCHAR(64),
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
                INDEX idx_user (user_id),
                INDEX idx_entity (entity_type, entity_id),
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            -- 30. REFRESH TOKENS TABLE
            CREATE TABLE refresh_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id CHAR(36) NOT NULL,
                token_hash VARCHAR(255) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                revoked_at TIMESTAMP NULL,
                last_used_at TIMESTAMP NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_user_token (user_id, token_hash),
                INDEX idx_expires (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;

        // Execute create tables
        connection.query(createTablesSQL, (err, results) => {
            if (err) {
                console.error('❌ Error creating tables:', err.message);
                console.error('❌ Error SQL:', err.sql);
                process.exit(1);
            } else {
                console.log('✅ All database tables created successfully!');
                
                // Now create additional indexes for performance
                createAdditionalIndexes(connection);
            }
        });

    } catch (error) {
        console.error('❌ Database initialization error:', error.message);
        process.exit(1);
    }
};

const createAdditionalIndexes = (connection) => {
    const indexesSQL = `
        -- CREATE ADDITIONAL INDEXES FOR PERFORMANCE
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
        
        -- Check if columns exist before creating indexes
        CREATE INDEX IF NOT EXISTS idx_pets_seller_id_status ON pets(seller_id, status);
        CREATE INDEX IF NOT EXISTS idx_pets_category_breed_status ON pets(category, breed_id, status);
        CREATE INDEX IF NOT EXISTS idx_pets_price ON pets(price);
        CREATE INDEX IF NOT EXISTS idx_pets_created_at ON pets(created_at);
        
        -- Products indexes
        CREATE INDEX IF NOT EXISTS idx_products_seller_id_status ON products(seller_id, status);
        CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
        CREATE INDEX IF NOT EXISTS idx_products_price_rating_avg ON products(price, rating_avg);
        
        -- Messages indexes
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at ON messages(conversation_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_messages_receiver_id_unread ON messages(receiver_id, is_read);
        
        -- Orders indexes
        CREATE INDEX IF NOT EXISTS idx_orders_buyer_id_created_at ON orders(buyer_id, created_at);
        
        -- Check if seller_id exists in orders table before creating index
        SET @dbname = DATABASE();
        SET @exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @dbname AND table_name = 'orders' AND column_name = 'seller_id');
        
        SET @sql = IF(@exists > 0, 
            'CREATE INDEX idx_orders_seller_id ON orders(seller_id)',
            'SELECT "Column seller_id does not exist in orders table" as message'
        );
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
        
        -- Favorites indexes
        CREATE INDEX IF NOT EXISTS idx_favorites_user_type ON favorites(user_id, item_type);
        
        -- Comments indexes
        CREATE INDEX IF NOT EXISTS idx_comments_target_type_id_created_at ON comments(comment_type, target_id, created_at);
        
        -- Analytics indexes
        CREATE INDEX IF NOT EXISTS idx_analytics_events_type_timestamp ON analytics_events(event_type, timestamp);
        CREATE INDEX IF NOT EXISTS idx_seller_analytics_daily_seller_id_date ON seller_analytics_daily(seller_id, date);
    `;

    connection.query(indexesSQL, (err) => {
        if (err) {
            console.log('⚠️  Some indexes could not be created (non-critical):', err.message);
            console.log('✅ Database is still fully functional!');
        } else {
            console.log('✅ Additional indexes created successfully!');
        }
        
        // Insert sample data
        insertSampleData(connection);
    });
};

const insertSampleData = (connection) => {
    // Generate UUIDs for sample data
    const adminId = uuidv4();
    const sellerId = uuidv4();
    const buyerId = uuidv4();
    const petId = uuidv4();
    const productId = uuidv4();
    const conversationId = uuidv4();
    const messageId = uuidv4();
    const blogId = uuidv4();
    const guideId = uuidv4();

    // Use a fixed date for sample data
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

    const sampleDataSQL = `
        -- Insert sample users
        INSERT INTO users (id, email, password_hash, first_name, last_name, role, account_status, email_verified, created_at, updated_at) VALUES
        ('${adminId}', 'admin@petmarketplace.com', '$2a$10$YourHashedPasswordHere', 'Admin', 'User', 'admin', 'active', true, '${now}', '${now}'),
        ('${sellerId}', 'seller@example.com', '$2a$10$YourHashedPasswordHere', 'John', 'Seller', 'user', 'active', true, '${now}', '${now}'),
        ('${buyerId}', 'buyer@example.com', '$2a$10$YourHashedPasswordHere', 'Jane', 'Buyer', 'user', 'active', true, '${now}', '${now}');

        -- Insert sample user profiles
        INSERT INTO user_profiles (user_id, is_seller, city, country) VALUES
        ('${adminId}', false, 'New York', 'USA'),
        ('${sellerId}', true, 'Los Angeles', 'USA'),
        ('${buyerId}', false, 'Chicago', 'USA');

        -- Insert sample sellers
        INSERT INTO sellers (user_id, verification_status, store_name, seller_rating, total_sales) VALUES
        ('${sellerId}', 'verified', 'John''s Pet Store', 4.8, 150);

        -- Insert sample breeds
        INSERT INTO breeds (name, category, description, popular) VALUES
        ('Golden Retriever', 'dog', 'Friendly and intelligent family dog', true),
        ('French Bulldog', 'dog', 'Playful and adaptable companion', true),
        ('Siamese Cat', 'cat', 'Vocal and social cat breed', true),
        ('Persian Cat', 'cat', 'Calm and affectionate lap cat', true);

        -- Insert sample pet
        INSERT INTO pets (id, seller_id, name, breed_id, category, age_months, gender, price, description, vaccinated, dewormed, status, city, state, country, created_at) VALUES
        ('${petId}', '${sellerId}', 'Luna', 1, 'dog', 3, 'female', 2500.00, 'Beautiful Golden Retriever puppy with great temperament. She is up to date on all vaccinations and comes with health certificate.', true, true, 'available', 'Los Angeles', 'CA', 'USA', '${now}');

        -- Insert sample pet image
        INSERT INTO pet_images (pet_id, image_url, is_primary) VALUES
        ('${petId}', '/uploads/pets/luna1.jpg', true);

        -- Insert sample product
        INSERT INTO products (id, seller_id, name, category, pet_type, price, sku, stock_quantity, status, created_at) VALUES
        ('${productId}', '${sellerId}', 'Premium Dog Collar', 'collars', '["dog"]', 24.99, 'COL-001', 50, 'active', '${now}');

        -- Insert sample product image
        INSERT INTO product_images (product_id, image_url, is_primary) VALUES
        ('${productId}', '/uploads/products/collar1.jpg', true);

        -- Insert sample blog post
        INSERT INTO blog_posts (id, author_id, title, slug, content, category, status, published_at, created_at) VALUES
        ('${blogId}', '${adminId}', 'How to Care for Your New Puppy', 'how-to-care-for-new-puppy', 'Comprehensive guide for new puppy owners...', 'care', 'published', '${now}', '${now}');

        -- Insert sample guide
        INSERT INTO guides (id, author_id, title, slug, guide_type, breed_id, content, status, published_at, created_at) VALUES
        ('${guideId}', '${adminId}', 'Complete Golden Retriever Care Guide', 'golden-retriever-care-guide', 'breed', 1, 'Everything you need to know about Golden Retrievers...', 'published', '${now}', '${now}');

        -- Insert sample conversation
        INSERT INTO conversations (id, created_at, updated_at, last_message_at, status) VALUES
        ('${conversationId}', '${now}', '${now}', '${now}', 'active');

        -- Insert conversation participants
        INSERT INTO conversation_participants (conversation_id, user_id, last_read_at) VALUES
        ('${conversationId}', '${buyerId}', '${now}'),
        ('${conversationId}', '${sellerId}', '${now}');

        -- Insert sample message
        INSERT INTO messages (id, conversation_id, sender_id, receiver_id, message_content, is_read, created_at) VALUES
        ('${messageId}', '${conversationId}', '${buyerId}', '${sellerId}', 'Hi, is Luna still available? I would love to meet her!', true, '${now}');

        -- Insert sample subscription
        INSERT INTO subscriptions (id, user_id, plan_type, billing_cycle, status, price_paid, currency, start_date, end_date, auto_renew, created_at) VALUES
        (UUID(), '${sellerId}', 'pro', 'monthly', 'active', 24.99, 'USD', '${now}', '${nextYear}', true, '${now}');
    `;

    connection.query(sampleDataSQL, (err) => {
        if (err) {
            console.error('❌ Error inserting sample data:', err.message);
            console.error('❌ Error SQL:', err.sql);
        } else {
            console.log('✅ Sample data inserted successfully!');
            console.log('\n📝 Test Accounts:');
            console.log('----------------------------------------');
            console.log('Admin:    admin@petmarketplace.com');
            console.log('Seller:   seller@example.com');
            console.log('Buyer:    buyer@example.com');
            console.log('Password: password123 (you need to hash this manually in production)');
            console.log('----------------------------------------');
        }
        
        // Close connection
        connection.end();
        console.log('\n✅ Database initialization complete!');
        console.log('🚀 You can now start your server with: npm run dev');
    });
};

// Run the initialization
createTables();