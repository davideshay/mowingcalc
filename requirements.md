Create a node program that will perform the following tasks:

* There are 2 parts to the program - a user interface and an always-running scheduling algorithm that can trigger a lawn mowing.
* The algorithm will:
    * Retrieve weather information from local Home Assistant instance running on https://hassist.shaytech.net
        * Retrieve from specified sources a set of hyperlocal information on rainfall intensity over time, as well as sunshine conditions over time for the past 7 days
        * For these, use a median type approach for calculation to avoid outliers
        * Retrieve weather forecast information for the next 24 hours, if available in an hourly view, as well as daily forecast over next 2-5 days, specifically looking for if rain is in the forecast
    * Using retrieved information on actual rain and actual sunshine and type of grass, calculate a growth rate of the grass. This may require some research on the best formula to predict this. For current purposes, assume tall fescue grass.
    * Calculate using another algorithm, which may require further research, how much time is needed to delay mowing for a robotic mower given the past amounts of rain over time, and amount of sun and ambient temperature. Using this information and the configurable minimum time after rain before mowing setting, calculate a range from earliest possible time to start mowing where the grass won't be damaged, to an optimal time to wait.
    * If you are not in a configurable mowing window based on day of the week, wait for a period of time, then re-check.
    * If you are before the earliest possible time to mow based on rain delay, do not trigger mowing, wait for a period of time, then re-check. 
    * Retrieve data from home assistant on when the lawn was last mowed
    * If you are before the minimum time between mows past when the lawn was mowed, wait for a period of time, then re-check.
    * If you are after the maximum time between mows past when the lawn was mowed, and there is a less than the configured chance of precipitation for the average mowing duration, trigger mowing immediately.
    * Based on last mow date and growth rate algorithm, determine the expected growth total since the last mow.
    * If expected growth total is below the configured lower limit, do not trigger mowing, wait for a period of time then re-check.
    * Get input from program configuration on minimum and maximum growth limits
    * Take into account a table of allowed mowing times by day. Some of these need to be a variable like "sunset" plus or minus a certain time element
    * If based on the estimated lawn growth, you are already above the maximum growth rates, and within an allowed mowing time, and there is a less than the configured chance of precipitation for the average mowing duration, trigger mowing immediately.
    * Since you are over the lower limit, predict the time when the lawn will cross the upper limit, then look at the weather forecast and see if there will be a sufficient chance to mow prior to crossing the upper limit. If so, wait. If not, and if there is a less than the configured chance of precipitation for the average mowing duration, trigger mowing immediately.
* The web-based user interface should be visually compelling and allow for multiple functions:
    * A means to configure some inputs, such as:
        * type of grass
        * lower limit to trigger a mow if future conditions are uncertain
        * maximum upper limit to trigger a mow immediately if growth estimates exceed this rate
        * Minimum time after rain before mowing
        * Minimum time between mows
        * Maximum time between mows
        * Average expected mowing duration (will be calculated over time, but initial setting)
        * Time between algorithm re-runs, should reflect how often source systems are truly being updated
        * Minimum Percentage of precipation chance to prevent mowing
    * A view of lawn mowing history
    * A view of key data driving the algorithmic decision (past data and future forecast, typical mowing duration)
    * A prediction of next mow time given the current data
* Make a recommendation on whether the data should be stored separately for this app or just retrieved from home assistant
* Make a recommendation on whether this should just be one node application or be split into a node backend and a react frontend, or other recommendation.