// Simple content controller returning static nutrition/wellness articles
exports.getContent = async (req, res) => {
    const articles = [
        {
            id: 1,
            title: "Kickstart Your Year: 5 Healthy Habits",
            summary: "Small daily changes that lead to lasting health improvements.",
            body: "Start with hydration, aim for 30 minutes of movement, plan meals, prioritize sleep, and practice mindful eating."
        },
        {
            id: 2,
            title: "Simple Meal Prep for Busy Weekdays",
            summary: "Meal prep doesn't have to be complicated.",
            body: "Choose a protein, a grain, and two veggies. Roast or steam in batches, portion into containers, and add fresh greens when serving."
        },
        {
            id: 3,
            title: "Mindful Eating: How to Start",
            summary: "Techniques to connect with hunger and fullness cues.",
            body: "Slow down, remove distractions, chew thoroughly, and check in with hunger levels before and after meals."
        }
    ];

    res.json(articles);
};
