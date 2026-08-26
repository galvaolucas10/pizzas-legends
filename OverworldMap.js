class OverworldMap {
    constructor(config){
        this.gameObjects = config.gameObjects;

        this.lowerImage = new Image();
        this.lowerImage.src = config.lowerSrc;

        this.upperImage = new Image();
        this.upperImage.src = config.upperSrc;
    }

    drawLowerImage(ctx) {
        ctx.drawImage(this.lowerImage, 0, 0)
    }

    drawUpperImage(ctx) {
        ctx.drawImage(this.upperImage, 0, 0)
    }
}

window.OverworldMap = {
    DemoRoom: {
       lowerSrc: "images/DemoLower.png",
       upperSrc: "images/DemoUpper.png",
       gameObjects: {
        hero: new GameObject({
            x: 5,
            y: 6,
        }),
        npc1: new GameObject({
            x: 7,
            y: 9,
            src: "images/npc1.png"
        })
       }
    },
    Kitchen: {
       lowerSrc: "images/KitchenLower.png",
       upperSrc: "images/KitchenUpper.png",
       gameObjects: {
        hero: new GameObject({
            x: 3,
            y: 5,
        }),
        npcA: new GameObject({
            x: 9,
            y: 6,
            src: "images/npc2.png"
        }),
        npcB: new GameObject({
            x: 10,
            y: 8,
            src: "images/npc3.png"
        })
       }
    },
 }