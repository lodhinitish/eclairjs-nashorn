/*
 * Copyright 2016 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var sparkConf = new SparkConf()
  .setAppName("Ranking Metrics Example")
  .setMaster("local[*]");

var sc = new SparkContext(sparkConf);
var data = data = sc.textFile("examples/data/mllib/sample_movielens_data.txt");

var ratings = data.map(function(line) {
    var arr = line.split("::");
    var r = new Rating(parseInt(arr[0]),
                       parseInt(arr[1]),
                       parseFloat(arr[2]) - 2.5);
    return r;
}).cache();

var model = ALS.train2(ratings, 10, 10, 0.01);
var userRecs = model.recommendProductsForUsers(10);

var userRecommendedScaled = userRecs.map(function(val) {
  var newRatings = val[1].map(function(r) {
    var newRating = Math.max(Math.min(r.rating(), 1.0), 0.0);
    return new Rating(r.user(), r.product(), newRating);
  });

  return new Tuple(val[0], newRatings);
});

var userRecommended = PairRDD.fromRDD(userRecommendedScaled);

var binarizedRatings = ratings.map(function(r) {
    if (r.rating() > 0.0) {
        binaryRating = 1.0;
    } else {
        binaryRating = 0.0;
    }
    
    return new Rating(r.user(), r.product(), binaryRating);
});

var userMovies = binarizedRatings.groupBy(function(r) {
    return r.user();
});

//print("userMovies:");
//print(userMovies.take(10));

var userMoviesList = userMovies.mapValues(function(docs) {
    return docs.reduce(function(prev, curr) {
        if(curr.rating() > 0.0) {
            return prev.concat(curr.product());
        }

        return prev;
    }, []);
});

//print("userMoviesList:");
//print(userMoviesList.take(10));

var userRecommendedList = userRecommended.mapValues(function(docs) {
    return docs.map(function(rating) {
        return rating.product();
    });
});

//print("userRecommendedList:");
//print(userRecommendedList.take(10));

var relevantDocs = userMoviesList.join(userRecommendedList).values();

//print(relevantDocs.take(10));

var metrics = RankingMetrics.of(relevantDocs);

// Precision and NDCG at k
[1, 3, 5].forEach(function(k) {
    print("Precision at " + k + " = " + metrics.precisionAt(k));
    print("NDCG at " + k + " = " + metrics.ndcgAt(k));
});

print("Mean average precision = " + metrics.meanAveragePrecision());

var userProducts = ratings.map(function(r) {
    return new Tuple(r.user(), r.product());
});

print("userProducts:");
print(userProducts.take(10));

var predictions = PairRDD.fromRDD(model.predict1(userProducts).map(function(r) {
    print("r = " + r);
    return new Tuple(new Tuple(r.user(), r.product()), r.rating());
}));

print("predictions:");
print(predictions.take(10));

var ratesAndPreds = PairRDD.fromRDD(ratings.map(function(r) {
    return new Tuple(new Tuple(r.user(), r.product()), r.rating());
})).join(predictions).values();

print("ratesAndPreds:");
print(ratesAndPreds.take(10));
// Create regression metrics object
var regressionMetrics = new RegressionMetrics(ratesAndPreds);

// Root mean squared error
print("RMSE = " + regressionMetrics.rootMeanSquaredError());

// R-squared
print("R-squared = " + regressionMetrics.r2());