using UnityEngine;

namespace StarLetters
{
    // Small secondary motion, independent of the player's movement/collision root.
    public sealed class TravelerIdle : MonoBehaviour
    {
        public Transform scarfTail;
        Vector3 rest;
        void Awake() => rest=transform.localPosition;
        void LateUpdate()
        {
            transform.localPosition=rest+Vector3.up*(Mathf.Sin(Time.time*2.4f)*.012f);
            if(scarfTail!=null)scarfTail.localRotation=Quaternion.Euler(Mathf.Sin(Time.time*2.1f)*7,0,-8);
        }
    }
}
