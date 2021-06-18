const db = require('../db/connection');

const {
  noReview,
  badData,
  rejectData,
  badSortBy,
  badOrder,
  badCategory,
  noCatResults,
} = require('../errors/custom-errors');

exports.selectCategories = async () => {
  const { rows: categories } = await db.query(`SELECT * FROM categories`);
  return { categories: categories };
};

exports.selectReviews = async (query) => {
  const reviewCols = [
    'owner',
    'title',
    'review_id',
    'category',
    'review_img_url',
    'created_at',
    'votes',
  ];

  const { rows } = await db.query(`
  SELECT slug FROM categories;
  `);

  const categories = rows.map((cat) => {
    return cat.slug;
  });

  const { sort_by = 'created_at' } = query;
  const { order = 'desc' } = query;
  const { category } = query;

  const filters = [];

  let qryStr = `
  SELECT reviews.owner, title, reviews.review_id, category, review_img_url, reviews.created_at, reviews.votes, COUNT(comments.review_id)::INT AS comment_count 
  FROM reviews
  LEFT JOIN comments
  ON comments.review_id = reviews.review_id
  `;

  if (categories.includes(category)) {
    filters.push(category);
    qryStr += `
  WHERE category = $1
  `;
  } else if (category) await badCategory();

  qryStr += `
  GROUP BY reviews.review_id
  `;

  if (!reviewCols.includes(sort_by)) await badSortBy();
  if (order !== 'desc' && order !== 'asc') await badOrder();

  qryStr += `
  ORDER BY ${sort_by} ${order}
    `;

  const { rows: qryResults } = await db.query(qryStr + ';', filters);

  if (category && qryResults.length === 0) {
    await noCatResults();
  }

  return { reviews: qryResults };
};

exports.selectReviewById = async (reviewId) => {
  const { rows: qryResults } = await db.query(
    `
      SELECT reviews.*, COUNT(comments.review_id)::INT AS comment_count
      FROM reviews
      LEFT JOIN comments
      ON comments.review_id = reviews.review_id
      WHERE reviews.review_id = $1
      GROUP BY reviews.review_id
  ;
  `,
    [reviewId]
  );

  if (!qryResults[0]) await noReview();
  else return { review: qryResults[0] };
};

exports.selectCommentsByReviewId = async (reviewId) => {
  const { rows: qryResults } = await db.query(
    `
SELECT comments.comment_id, comments.votes, comments.created_at, comments.author, comments.body  FROM reviews
LEFT JOIN comments
ON reviews.review_id = comments.review_id
WHERE comments.review_id = $1
;
`,
    [reviewId]
  );
  if (qryResults.length === 0) await noReview();
  else return { comments: qryResults };
};

exports.insertReviewById = async (reviewId, body) => {
  const { inc_votes } = body;

  const [isError, errMsg] = badData(body, inc_votes);

  if (isError) await rejectData(errMsg);
  else {
    const { rows: qryResults } = await db.query(
      `
  UPDATE reviews SET votes = votes + $1
  WHERE review_id = $2
  RETURNING *
  `,
      [inc_votes, reviewId]
    );

    return { newVotes: qryResults[0].votes };
  }
};
