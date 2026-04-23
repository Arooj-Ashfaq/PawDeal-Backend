const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getFavorites,
  addFavorite,
  removeFavorite,
  checkFavorite
} = require('../controllers/favoriteController');

router.use(authenticate);

router.get('/', getFavorites);
router.post('/', addFavorite);
router.delete('/:petId', removeFavorite);
router.get('/check/:petId', checkFavorite);

module.exports = router;