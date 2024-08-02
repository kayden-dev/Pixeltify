import express from "express";
import axios from "axios";
import cryptoRandomString from "crypto-random-string";
import dotenv from "dotenv";
import cookieParser from "cookie-parser"
import queryString from "query-string";
import bodyParser from "body-parser";
import Jimp from "jimp";
import looksSame from "looks-same";

// creates the express app and sets up relevant middleware
const app = express();
dotenv.config();
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// constants related to the application
const port = process.env.PORT;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;

// route for the home page
app.get("/",(req,res)=>{
    res.render("index.ejs");
});

// route for logging into spotify
app.get("/login",(req,res)=>{
    // redirects the user to the spotify authrization page with the appropriate params
    const state = cryptoRandomString({length: 16});
    const scope = "user-top-read";
    res.cookie("auth",state);
    console.log("the state is " + state);

    res.redirect('https://accounts.spotify.com/authorize?' +
        queryString.stringify({
          response_type: 'code',
          client_id: clientId,
          scope: scope,
          redirect_uri: redirectUri,
          state: state
        }));
});

// route called after user authorization
app.get("/callback", async (req, res) => {
    // gets the code, state and stored state from the response
    const code = req.query.code || null; 
    const state = req.query.state || null;
    const storedState = req.cookies ? req.cookies.auth : null;

    // checks if the state matches/exists
    if (state === null || state !== storedState){
        res.send("ERROR: State Mismatch");
    } else {
        // if the state matches/exists, then a request is made to exchange the authorization code for the access token
        try {
            // sends a request for the access token
            const result = await axios.post("https://accounts.spotify.com/api/token", {
                grant_type: "authorization_code",
                code: code,
                redirect_uri: redirectUri
            },{
                headers:{
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Authorization" : "Basic " + (new Buffer.from(clientId + ':' + clientSecret).toString('base64'))
                }
            });

            // saves the access token and refresh token as cookies
            res.cookie("aTok",result.data.access_token,{
                httpOnly: true,
                maxAge: 3600000,
                secure: true
            });
            res.cookie("rTok",result.data.refresh_token,{
                httpOnly: true,
                secure: true
            });

            // testing the original access and refresh token
            console.log("original access token " + result.data.access_token);

            // redirects to the start endpoint
            res.redirect("/start");

          } catch (error) {
            res.send("ERROR: " + error.message);
          }
    }
});

// route for starting the game
app.get("/start", async (req,res)=>{
    // retrieves the access token if it exists
    let accessToken;
    if (!req.cookies.aTok){
        // if it doesn't exist, then resets the access token
        console.log("access token does not exist");
        accessToken = await getAccessToken(req);

        res.cookie("aTok",accessToken,{
            httpOnly: true,
            maxAge: 3600000,
            secure: true
        });
    } else {
        accessToken = req.cookies.aTok;
    }
    
    console.log("received access token: " + accessToken);
    // gets the users top songs and chooses a random album
    try {
        // currently, the list is the top 200 songs of the past year
        const result1 = await axios.get(/*`https://api.spotify.com/v1/search?${queryString.stringify({q:"alchemy by disclosure"})}&type=album`*/"https://api.spotify.com/v1/me/top/tracks?time_range=medium_term&limit=50&offset=0",{
            headers:{
                "Authorization" : "Bearer " + accessToken
            }
        });
        const result2 = await axios.get(result1.data.next,{
            headers:{
                "Authorization" : "Bearer " + accessToken
            }
        });
        const result3 = await axios.get(result2.data.next,{
            headers:{
                "Authorization" : "Bearer " + accessToken
            }
        });
        const result4 = await axios.get(result3.data.next,{
            headers:{
                "Authorization" : "Bearer " + accessToken
            }
        });

        // chooses a random song and gets its album
        const topSongList = result1.data.items.concat(result2.data.items).concat(result3.data.items).concat(result4.data.items);
        const randomAlbum = topSongList[Math.floor(Math.random()*topSongList.length)].album;

        // saves the album id as a cookie
        res.cookie("alb",randomAlbum.id);

        // saves the image as a cookie
        res.cookie("img",randomAlbum.images[0].url);

        // initialises the number of guesses
        res.cookie("guess",0);

        // testing pixelating the image
        const pixelatedImg = await pixelateImage(randomAlbum.images[0].url,0);
        res.render("play2.ejs",{img:pixelatedImg,guess:0});

    } catch (error) {
        console.log("ERROR: " + error.message);
    }
});

app.post("/search",async (req,res)=>{
    // retrieves the access token if it exists
    let accessToken;
    if (!req.cookies.aTok){
        // if it doesn't exist, then resets the access token
        console.log("access token does not exist");
        accessToken = await getAccessToken(req);

        res.cookie("aTok",accessToken,{
            httpOnly: true,
            maxAge: 3600000,
            secure: true
        });
    } else {
        accessToken = req.cookies.aTok;
    }

    // searches for the albums related to the users search
    const userSearch = req.body.searchInput;
    try {
        const result = await axios.get(`https://api.spotify.com/v1/search?${queryString.stringify({q: userSearch})}&type=album&limit=50`,{
            headers:{
                "Authorization" : "Bearer " + accessToken
            }
        });
        console.log(`https://api.spotify.com/v1/search?${queryString.stringify({q: userSearch})}&type=album&limit=50`);
        // gets the top 5 results, ensuring there are no duplicates
        let userAlbums = [];
        // iterates through each album, and compares it to the albums currently in userAlbums
        result.data.albums.items.forEach(newAlbum=>{
            //console.log(newAlbum.name);
            // checks if the album is in userAlbums by comparing the name and artist name
            let inArray = false;
            userAlbums.forEach(prevAlbum=>{
                if (newAlbum.name === prevAlbum.name && newAlbum.artists[0].name === prevAlbum.artists[0].name){
                    //console.log(newAlbum.name + " matches with " + prevAlbum.name);
                    inArray = true;
                }
            });

            // if the album is not in userAlbums and there is less than 5 albums
            if (inArray === false && userAlbums.length < 5){
                userAlbums.push(newAlbum);
            }
        });

        // checks if no results were returned
        const pixelatedImg = await pixelateImage(req.cookies.img,req.cookies.guess);
        if (userAlbums.length === 0){
            // if there were no results returned, send an error
            res.render("play2.ejs",{img:pixelatedImg,error:"No results found",guess:req.cookies.guess});
        } else {
            // if there were, then renders with the results
            res.render("play2.ejs",{img:pixelatedImg,albums:userAlbums,guess:req.cookies.guess});
        }


    } catch (error){
        console.log("ERROR: " + error.message);
    }
});


app.post("/check", async(req,res)=>{
    // retrieves the access token if it exists
    let accessToken;
    if (!req.cookies.aTok){
        // if it doesn't exist, then resets the access token
        console.log("access token does not exist");
        accessToken = await getAccessToken(req);

        res.cookie("aTok",accessToken,{
            httpOnly: true,
            maxAge: 3600000,
            secure: true
        });
    } else {
        accessToken = req.cookies.aTok;
    }

    // check the result the user chose
    console.log("CHECKING...");

    // converts the urls to images
    const image1 = await Jimp.read(req.body.searchRes);
    const image2 = await Jimp.read(req.cookies.img);
    
    // save the images to a buffer
    const buffer1 = await image1.getBufferAsync(Jimp.MIME_JPEG);
    const buffer2 = await image2.getBufferAsync(Jimp.MIME_JPEG);

    // check if the covers look the same
    const result = await looksSame(buffer1,buffer2,{tolerance:10});

    // if they are the same, then display a page
    console.log("testing with " + req.body.searchRes);
    if (result.equal) {
        // gets the name and artists of the album
        const [albumName,albumArtist] = await getAlbumName(req.cookies.alb,accessToken);
        res.render("play2.ejs",{img:req.cookies.img,guess:req.cookies.guess,details:[albumName,albumArtist]});
    // if not, then make the image clearer, increase the number of guesses, and render the image clearer (check if the user has made the max num of guesses)
    } else {
        // gets the current number of guesses and increments it
        let numGuesses = Number(req.cookies.guess) + 1;
        
        // checks if the number of guesses has exceeded the maximum (5)
        if (numGuesses > 4){
            // gets the name and artists of the album
            const [albumName,albumArtist] = await getAlbumName(req.cookies.alb,accessToken);
            res.render("play2.ejs",{img:req.cookies.img,guess:req.cookies.guess,details:[albumName,albumArtist]});
        // if not, then renders the image clearer
        } else {
            // pixelates the image clearer
            const pixelatedImg = await pixelateImage(req.cookies.img,numGuesses);

            // saves the number of guesses
            res.cookie("guess",numGuesses);

            // renders the new page
            res.render("play2.ejs",{img:pixelatedImg,guess:numGuesses});
        }
    }


});

app.listen(port,() => {
    console.log(`Server is running on port ${port}`);
});

// function gets the access token using the refresh token
async function getAccessToken (req,res) {
    if (req.cookies.aTok){
        return req.cookies.aTok

    } else {
        // if it doesn't exist, then resets the access token
        console.log("access token does not exist");

        // gets the refresh token through the cookie
        const refreshToken = req.cookies.rTok;

        // retrieves the new access token using the refresh token
        try {
            const result = await axios.post("https://accounts.spotify.com/api/token", {
                grant_type: "refresh_token",
                refresh_token: refreshToken
            },{
                headers:{
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Authorization" : "Basic " + (new Buffer.from(clientId + ':' + clientSecret).toString('base64'))
                }
                
            });
            // returns the new access token
            console.log("new access token: " + result.data.access_token)

            res.cookie("aTok",result.data.access_token,{
                httpOnly: true,
                maxAge: 3600000,
                secure: true
            });

            return result.data.access_token;
        } catch (error) {
            console.log("ERROR: " + error.message);
        }
    }


}

// function pixelates an image and returns the link
async function pixelateImage (imgURL,numGuesses) {
    // NOTE: progression idea
    // image cell goes from 320 -> 160 -> 80 -> 40 -> 20
    // player gets 5 guesses per album
    try {
        // gets the pixel size
        const pixelSize = 320/Math.pow(2,numGuesses);
        console.log("pixel size: " + pixelSize);

        // gets the image and pixelates it
        const image = await Jimp.read(imgURL);
        image.pixelate(pixelSize);

        // saves the image into a buffer and converts it to a base64 string
        const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);
        const base64Image = buffer.toString("base64");

        // saves the image into a data url and returns it
        const dataURL = `data:image/jpeg;base64,${base64Image}`;
        return dataURL;
    } catch (error){
        console.log("Error processing image" + error.message);
    }
}

// TODO MAKE A FUNCTION TO GET THE NAME OF ALBUM AND ARTIST TO DISPLAY AT THE END + ERROR HANDLING
async function getAlbumName(albumId,accessToken){
    try {
        // searches for the album using the spotify ID
        const result = await axios.get(`https://api.spotify.com/v1/albums/${albumId}`,{
            headers:{
                "Authorization" : "Bearer " + accessToken
            }
        });
        // gets the name and artist of the album
        const albumName = result.data.name;
        const albumArtist = result.data.artists[0].name;

        return [albumName,albumArtist];
    } catch (error) {
        console.log("ERROR" + error.message);
    }
    // saves the name and artist name as an array and return
}
